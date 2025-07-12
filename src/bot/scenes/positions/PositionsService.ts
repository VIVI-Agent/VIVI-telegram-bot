import { PnlServiceWithCache } from "blockchain/services/pnl/pnlServiceWithCache";
import { BaseService, GlobalSceneContext } from "../../types";
import { getTokenBalance } from "blockchain/transactions/balanceToken";
import { Address } from "viem";

export class PositionsService extends BaseService {
  private backgroundOperations: Set<Promise<any>> = new Set();
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
  async loadUserPnl(ctx: GlobalSceneContext) {
    try {
      if (!this.checkIfActive(ctx))
        return { data: [], isFromCache: false, needsUpdate: false };

      this.log("info", ctx, `Loading positions for user: ${ctx.user.id}`);

      const pnlService = new PnlServiceWithCache();

      const pnlResult = await pnlService.getUserPnlSummaryWithCache(
        ctx,
        ctx.user.id
      );

      // If we got cached data but it needs update, trigger background refresh
      if (pnlResult.isFromCache && pnlResult.needsUpdate && this.isActive) {
        this.log("info", ctx, "Cache is stale, triggering background update");
        // Fire and forget - update in background with timeout protection
        const backgroundUpdate = this.updateCacheInBackground(ctx, pnlService)
          .catch((error) => {
            this.log("error", ctx, `Background cache update failed: ${error}`);
          })
          .finally(() => {
            // Remove from tracking set when done
            this.backgroundOperations.delete(backgroundUpdate);
          });

        // Track background operation
        this.backgroundOperations.add(backgroundUpdate);
      }

      this.log(
        "info",
        ctx,
        `Positions loaded: ${pnlResult.data.length} tokens, fromCache: ${pnlResult.isFromCache}`
      );

      return pnlResult;
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

      // Group holdings by wallet and token for efficient updates
      const holdingsByWalletToken = new Map<string, any>();

      for (const holding of allHoldings) {
        const key = `${holding.walletId}-${holding.tokenId}`;
        holdingsByWalletToken.set(key, holding);
      }

      // Update balances for each wallet-token combination
      const updatePromises = wallets.map(async (wallet: any) => {
        const walletHoldings = allHoldings.filter(
          (h) => h.walletId === wallet.id
        );

        return Promise.all(
          walletHoldings.map(async (holding) => {
            try {
              // Get current balance from blockchain
              const currentBalance = await getTokenBalance(
                holding.token.address as Address,
                wallet.address as Address
              );

              // Update holding in database
              await ctx.services.holdingService.updateHoldingFromChain({
                userId: ctx.user.id,
                tokenId: holding.tokenId,
                walletId: wallet.id,
                newBalance: currentBalance,
              });

              this.log(
                "debug",
                ctx,
                `Updated ${holding.token.symbol} balance for wallet ${wallet.address}: ${currentBalance}`
              );
            } catch (error) {
              this.log(
                "error",
                ctx,
                `Failed to update ${holding.token.symbol} balance for wallet ${wallet.address}: ${error}`
              );
            }
          })
        );
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
      if (!this.checkIfActive(ctx))
        return { data: [], isFromCache: false, needsUpdate: false };

      this.log(
        "info",
        ctx,
        `Force refreshing positions for user: ${ctx.user.id}`
      );

      // First, clear old PnL cache to ensure fresh data
      await ctx.services.pnlCacheService.clearUserPnlCache(ctx.user.id);
      this.log("info", ctx, "Cleared old PnL cache");

      // Second, update all holdings from blockchain
      await this.updateHoldingsFromBlockchain(ctx);

      const pnlService = new PnlServiceWithCache();

      // For refresh, we want to always get fresh data and update cache
      const freshData = await pnlService.calculateFreshUserPnl(
        ctx,
        ctx.user.id
      );

      // Save to cache only if service is still active
      if (this.isActive) {
        await pnlService.saveFreshDataToCache(ctx, ctx.user.id, freshData);
      }

      this.log("info", ctx, `Positions refreshed: ${freshData.length} tokens`);

      return {
        data: freshData,
        isFromCache: false,
        needsUpdate: false,
      };
    } catch (error) {
      this.log("error", ctx, `Error refreshing positions: ${error}`);
      throw error;
    }
  }

  /**
   * Update cache in background without blocking UI (with timeout protection)
   */
  private async updateCacheInBackground(
    ctx: GlobalSceneContext,
    pnlService: PnlServiceWithCache
  ): Promise<void> {
    try {
      this.log("debug", ctx, "Starting background cache update");

      // 🛡️ PROTECTION: Add timeout to prevent hanging operations
      const updatePromise = pnlService.updateUserPnlCacheInBackground(
        ctx,
        ctx.user.id
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Background update timeout")), 60000); // 60s timeout
      });

      // Race between update and timeout
      await Promise.race([updatePromise, timeoutPromise]);

      // Double-check if service is still active before logging success
      if (this.isActive) {
        this.log("debug", ctx, "Background cache update completed");
      } else {
        this.log(
          "debug",
          ctx,
          "Background cache update completed but service is inactive"
        );
      }
    } catch (error) {
      // Only log error if service is still active (avoid noise during cleanup)
      if (this.isActive) {
        this.log("error", ctx, `Background cache update error: ${error}`);
      }
      // Don't throw - this is background operation
    }
  }

  /**
   * Cancel all background operations (called during cleanup)
   */
  async cancelBackgroundOperations(): Promise<void> {
    this.deactivate(); // Mark as inactive first

    if (this.backgroundOperations.size > 0) {
      // Note: Using console.log instead of this.log since ctx might not be available during cleanup
      console.log(
        `[PositionsService:${this.instanceId}] Cancelling ${this.backgroundOperations.size} background operations`
      );

      // Wait a bit for operations to check isActive flag and exit gracefully
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.backgroundOperations.clear();
    }
  }
}
