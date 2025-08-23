import { BaseService, GlobalSceneContext } from "../../types";
import { ERC20_ABI } from "abis/erc20/erc20";
import { Address, formatUnits, getAddress } from "viem";
import { getBestDexForSellTokenToEth } from "@blockchain";
import { publicClientDRPC } from "@client";

export class PositionsService extends BaseService {
  private isActive: boolean = true;

  constructor(instanceId: string) {
    super(instanceId, "PositionsService");
  }

  /**
   * Mark service as inactive (called during cleanup)
   */
  deactivate(): void {
    this.isActive = false;
    // Note: Using console.log instead of this.log since ctx might not be available during cleanup
    console.log(
      `[PositionsService:${this.instanceId}] Service marked as inactive`
    );
  }

  /**
   * Check if service is still active
   */
  private checkIfActive(ctx: GlobalSceneContext): boolean {
    if (!this.isActive) {
      this.log(
        "warn",
        ctx,
        `Service ${this.instanceId} is no longer active, aborting operation`
      );
      return false;
    }
    return true;
  }

  /**
   * Load user positions with cache-first approach
   */
  async loadUserPositions(ctx: GlobalSceneContext) {
    try {
      if (!this.checkIfActive(ctx)) return { data: [] };

      this.log("info", ctx, `Loading token balances for user: ${ctx.user.id}`);

      const holdings = await ctx.services.holdingService.getHoldingsByUserId(
        ctx.user.id
      );

      // Aggregate balances and cost basis by token across all wallets
      const byToken = new Map<
        number,
        {
          token: {
            symbol: string;
            address: string;
            id: number;
            decimals: number;
          };
          totalBalanceWei: bigint;
          totalCostBasisWei: bigint;
          realizedPnlWei: bigint;
        }
      >();
      for (const h of holdings) {
        const current = byToken.get(h.token.id) || {
          token: {
            symbol: h.token.symbol,
            address: h.token.address,
            id: h.token.id,
            decimals: h.token.decimals,
          },
          totalBalanceWei: 0n,
          totalCostBasisWei: 0n,
          realizedPnlWei: 0n,
        };
        current.totalBalanceWei += BigInt(h.balance);
        // @ts-ignore: new fields exist after migration; default to 0 if missing
        current.totalCostBasisWei += BigInt(
          (h as any).totalCostBasisWei ?? "0"
        );
        // @ts-ignore: new fields exist after migration; default to 0 if missing
        current.realizedPnlWei += BigInt((h as any).realizedPnlWei ?? "0");
        byToken.set(h.token.id, current);
      }

      // For each token, fetch a full-size sell quote to compute "sell now" value
      const entries = Array.from(byToken.values()).filter(
        (v) => v.totalBalanceWei > 0n
      );

      const data = await Promise.all(
        entries.map(async (v) => {
          try {
            const { best } = await getBestDexForSellTokenToEth({
              publicClient: publicClientDRPC,
              tokenIn: getAddress(v.token.address) as Address,
              feeTiers: [100, 500, 3000, 10000],
              amountTokenIn: v.totalBalanceWei,
              decimalsIn: v.token.decimals,
            });

            if (!best) {
              throw new Error("No best quote returned");
            }

            const quoteOutWei = BigInt(best.amountOut);
            const valueEth = parseFloat(formatUnits(quoteOutWei, 18));
            const costEth = parseFloat(formatUnits(v.totalCostBasisWei, 18));
            const unrealizedWei = quoteOutWei - v.totalCostBasisWei;
            const unrealizedEth = parseFloat(formatUnits(unrealizedWei, 18));
            const realizedEth = parseFloat(formatUnits(v.realizedPnlWei, 18));
            const pct = costEth > 0 ? (unrealizedEth / costEth) * 100 : 0;

            return {
              token: v.token,
              balance: formatUnits(v.totalBalanceWei, v.token.decimals),
              valueEth: valueEth.toFixed(4),
              unrealizedPnlEth: unrealizedEth.toFixed(4),
              pnlPct: `${pct.toFixed(2)}%`,
              realizedPnlEth: realizedEth.toFixed(4),
            };
          } catch (error) {
            this.log(
              "warn",
              ctx,
              `Quote failed for ${v.token.symbol} (${v.token.address}): ${error}`
            );
            // Fallback: show balance without value
            return {
              token: v.token,
              balance: formatUnits(v.totalBalanceWei, v.token.decimals),
              valueEth: "-",
              unrealizedPnlEth: "-",
              pnlPct: "-",
              realizedPnlEth: parseFloat(
                formatUnits(v.realizedPnlWei, 18)
              ).toFixed(4),
            };
          }
        })
      );

      this.log("info", ctx, `Positions loaded: ${data.length} tokens`);

      return { data };
    } catch (error) {
      this.log("error", ctx, `Error loading positions: ${error}`);
      throw error;
    }
  }

  /**
   * Update all user holdings from blockchain before calculating PnL
   */
  private async updateHoldingsFromBlockchain(
    ctx: GlobalSceneContext
  ): Promise<void> {
    try {
      this.log("info", ctx, "Updating holdings from blockchain...");

      // Get all user wallets
      const wallets = await ctx.services.walletService.getUserWallets(
        ctx.user.id
      );

      // Get all tokens that user has ever held
      const allHoldings = await ctx.services.holdingService.getHoldingsByUserId(
        ctx.user.id
      );

      // Update balances for each wallet using multicall to reduce RPC overhead
      const updatePromises = wallets.map(async (wallet: any) => {
        const walletHoldings = allHoldings.filter(
          (h) => h.walletId === wallet.id
        );

        if (walletHoldings.length === 0) {
          return;
        }

        // Build multicall contracts: balanceOf(token, wallet)
        const contracts = walletHoldings.map((holding) => ({
          address: (holding.token.address as string).toLowerCase() as Address,
          abi: ERC20_ABI,
          functionName: "balanceOf" as const,
          args: [wallet.address as Address],
        }));

        let results;
        try {
          results = await publicClientDRPC.multicall({
            allowFailure: true,
            contracts,
          });
        } catch (error) {
          this.log(
            "error",
            ctx,
            `Multicall failed for wallet ${wallet.address}: ${error}`
          );
          return;
        }

        for (let i = 0; i < walletHoldings.length; i++) {
          const holding = walletHoldings[i];
          const res = results[i];

          if (!res || res.status !== "success") {
            this.log(
              "warn",
              ctx,
              `Multicall balance failed for ${holding.token.symbol} (${holding.token.address}) on wallet ${wallet.address}`
            );
            continue;
          }

          const currentBalance = res.result as bigint;
          const previousBalance = BigInt(holding.balance ?? "0");

          // Only write if balance actually changed
          if (currentBalance !== previousBalance) {
            try {
              await ctx.services.holdingService.updateHoldingFromChain({
                userId: ctx.user.id,
                tokenId: holding.tokenId,
                walletId: wallet.id,
                newBalance: currentBalance,
              });

              this.log(
                "debug",
                ctx,
                `Updated ${holding.token.symbol} balance for wallet ${wallet.address}: ${previousBalance} -> ${currentBalance}`
              );
            } catch (error) {
              this.log(
                "error",
                ctx,
                `Failed to persist balance for ${holding.token.symbol} wallet ${wallet.address}: ${error}`
              );
            }
          }
        }
      });

      await Promise.all(updatePromises);
      this.log("info", ctx, "Holdings updated from blockchain successfully");
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error updating holdings from blockchain: ${error}`
      );
      throw error;
    }
  }

  /**
   * Refresh positions data (force fresh calculation)
   */
  async refreshPositions(ctx: GlobalSceneContext) {
    try {
      if (!this.checkIfActive(ctx)) return { data: [] };

      this.log(
        "info",
        ctx,
        `Force refreshing positions for user: ${ctx.user.id}`
      );

      // Second, update all holdings from blockchain
      await this.updateHoldingsFromBlockchain(ctx);

      // Then load positions from DB
      const result = await this.loadUserPositions(ctx);

      this.log(
        "info",
        ctx,
        `Positions refreshed: ${result.data.length} tokens`
      );

      return { data: result.data };
    } catch (error) {
      this.log("error", ctx, `Error refreshing positions: ${error}`);
      throw error;
    }
  }

  /**
   * Update cache in background without blocking UI (with timeout protection)
   */
  // Removed PnL cache background updates

  /**
   * Cancel all background operations (called during cleanup)
   */
  async cancelBackgroundOperations(): Promise<void> {
    this.deactivate();
  }
}
