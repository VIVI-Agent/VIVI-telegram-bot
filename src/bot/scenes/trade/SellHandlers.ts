import { logger } from "@logger";
import { GlobalSceneContext } from "../../types";
import { Address, decodeEventLog, formatUnits, TransactionReceipt } from "viem";
import { Token } from "@prisma/client";
import { getTokenBalance, getWalletBalance } from "@blockchain";
import {
  VIVIAerodromeABI,
  VIVIApeStoreABI,
  VIVIUniswapV2ABI,
  VIVIUniswapV3ABI,
  VIVIVirtualsHopABI,
  VIVIZoraMultiHopABI,
} from "@abis";
import { PnlServiceWithCache } from "blockchain/services/pnl/pnlServiceWithCache";

/**
 * SellHandlers: Static class that provides "parseLogsFn" and "onMinedFn" functions for different DEX
 * and detects transaction info (tokensIn, ethOut, etc.).
 */
export class SellHandlers {
  /**
   * Builds generic handlers for a DEX (UniswapV2, Aero, UniswapV3),
   * allowing an isGroup flag to customize log presentation.
   */
  public static buildGenericSellHandlers(params: {
    ctx: GlobalSceneContext;
    tokenData: Token;
    userId: number;
    walletId: number;
    txHash: Address;
    abi: any;
    eventName: string;
    parseEvent: (args: any) => { tokensIn: bigint; ethOut: bigint };
    isGroup?: boolean;
    onTransactionSuccess?: () => Promise<void>; // Callback para notificar éxito
  }) {
    const {
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      abi,
      eventName,
      parseEvent,
      isGroup,
      onTransactionSuccess,
    } = params;

    // parseLogsFn => handles formatting details
    const parseLogsFn = async (receipt: TransactionReceipt) => {
      let details = "";
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi,
            eventName,
            data: log.data as `0x${string}`,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          const { tokensIn, ethOut } = parseEvent(event.args);

          // Format amounts with max 4 decimal places
          const tokensInFormatted = parseFloat(
            formatUnits(tokensIn, tokenData.decimals)
          ).toFixed(4);
          const ethOutFormatted = parseFloat(formatUnits(ethOut, 18)).toFixed(
            4
          );

          if (isGroup) {
            // Summarized presentation for groups
            details += `\nReceived: ${ethOutFormatted} ETH`;
          } else {
            // More detailed presentation for private chat
            details += `- Token: ${tokenData.name}`;
            details += `\n- Tokens Sold: ${tokensInFormatted} ${tokenData.symbol}`;
            details += `\n- Ξ Out: ${ethOutFormatted}\n`;
          }
        } catch {}
      }
      return details;
    };

    // onMinedFn => updates DB, creates trade, etc.
    const onMinedFn = async (receipt: TransactionReceipt) => {
      let tokensSoldBN = 0n;
      let ethReceivedBN = 0n;

      // Extract tokensIn and ethOut
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi,
            eventName,
            data: log.data,
            topics: log.topics,
          });
          const result = parseEvent(event.args);
          tokensSoldBN = result.tokensIn;
          ethReceivedBN = result.ethOut;
        } catch {}
      }

      const wallet = await ctx.services.walletService.getWalletById(walletId);

      if (!wallet) {
        logger.error(`No wallet found with id ${walletId} for user ${userId}`);
        return;
      }

      // If ETH > 0 was received, update balances and handle success
      if (ethReceivedBN > 0n) {
        try {
          // 1. Update balances SYNCHRONOUSLY (critical for mode switching)
          await this.updateBalancesAfterTransaction(
            ctx,
            wallet,
            tokenData,
            userId
          );

          // 2. Execute success callback IMMEDIATELY (with updated balances)
          if (onTransactionSuccess) {
            await onTransactionSuccess();
            logger.info(
              `Transaction success callback executed for user ${userId}`
            );
          }

          // 3. Create trade and update PnL in background (not critical for mode switching)
          setImmediate(async () => {
            try {
              await this.createTradeAndUpdatePnl(
                ctx,
                userId,
                tokenData,
                wallet,
                txHash,
                tokensSoldBN,
                ethReceivedBN
              );
            } catch (err) {
              logger.error(
                "createTradeAndUpdatePnl failed in background:",
                err
              );
            }
          });

          // 4. Update user points and volume in background
          setImmediate(async () => {
            try {
              const tokenWL =
                await ctx.services.feeWhitelistService.getTokenWhitelist(
                  tokenData.address as Address
                );
              const bonusPercent = tokenWL?.bonusPointsPercent || 0;
              const pointsEarned =
                await ctx.services.userService.updateUserPoints({
                  userId,
                  ethVolumeWei: ethReceivedBN,
                  bonusPercent,
                });
              logger.info(
                `[${eventName}] user ${userId} earned ${pointsEarned} points from Sell.`
              );
            } catch (error) {
              logger.error(
                `[${eventName}]ERROR updateUserPoints userId ${userId} ethReceivedBN ${ethReceivedBN} .`
              );
              logger.error(`[${eventName}]ERROR updateUserPoints  ${error} .`);
            }

            try {
              await ctx.services.userService.updateUserVolumeSell(
                userId,
                ethReceivedBN
              );
              logger.info(
                `Updated user ${userId} sell volume: ${ethReceivedBN}`
              );
            } catch (error) {
              logger.error(`Error updating user volume: ${error}`);
            }
          });
        } catch (error) {
          logger.error(`Error in onMinedFn for user ${userId}:`, error);
        }
      }
    };

    return { parseLogsFn, onMinedFn };
  }

  /**
   * Update balances synchronously after transaction
   */
  private static async updateBalancesAfterTransaction(
    ctx: GlobalSceneContext,
    wallet: any,
    tokenData: Token,
    userId: number
  ): Promise<void> {
    try {
      // Validate tokenData has required fields
      if (!tokenData.address || !wallet.address) {
        logger.warn(
          `Skipping balance update: missing token address (${tokenData.address}) or wallet address (${wallet.address})`
        );
        return;
      }

      // Update ETH balance
      const newEthBalanceBN = await getWalletBalance(wallet.address as Address);
      await ctx.services.walletService.updateWalletBalance(
        wallet.id,
        newEthBalanceBN
      );
      logger.info(
        `Updated ETH balance for wallet ${wallet.id}: ${newEthBalanceBN}`
      );

      // Update token balance
      const newTokenBalanceBN = await getTokenBalance(
        tokenData.address as Address,
        wallet.address as Address
      );
      await ctx.services.holdingService.updateHoldingFromChain({
        userId: userId,
        tokenId: tokenData.id,
        walletId: wallet.id,
        newBalance: newTokenBalanceBN,
      });
      logger.info(
        `Updated token balance for ${tokenData.symbol} in wallet ${wallet.id}: ${newTokenBalanceBN}`
      );
    } catch (err) {
      logger.error(`Error updating balances for wallet ${wallet.id}:`, err);
      throw err; // Re-throw to prevent callback execution if balances fail
    }
  }

  /**
   * Create trade and update PnL (non-critical, runs in background)
   */
  private static async createTradeAndUpdatePnl(
    ctx: GlobalSceneContext,
    userId: number,
    tokenData: Token,
    wallet: any,
    txHash: Address,
    tokensSoldBN: bigint,
    ethReceivedBN: bigint
  ): Promise<void> {
    try {
      // Create trade record
      const newTrade = await ctx.services.tradeService.createSellTrade({
        userId,
        tokenId: tokenData.id,
        walletId: wallet.id,
        txHash,
        tokensSpent: tokensSoldBN,
        ethReceived: ethReceivedBN,
      });

      // Update PnL after trade is created
      await new PnlServiceWithCache().updatePnlForTrade(ctx, newTrade.id);
      await new PnlServiceWithCache().updateUserPnlCacheInBackground(
        ctx,
        userId
      );

      logger.info(
        `User ${userId} sell transaction processed. Trade ID: ${newTrade.id}`
      );
    } catch (err) {
      logger.error(
        `Error creating trade and updating PnL for user ${userId}:`,
        err
      );
      throw err;
    }
  }

  /**
   * Public helpers for each Dex
   */
  public static buildUniV2SellHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIUniswapV2ABI,
      eventName: "Sell",
      parseEvent: (args) => ({ tokensIn: args.tokensIn, ethOut: args.ethOut }),
    });
  }

  public static buildAeroSellHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIAerodromeABI,
      eventName: "Sell",
      parseEvent: (args) => ({
        tokensIn: args.tokenAmountIn,
        ethOut: args.ethOut,
      }),
    });
  }

  public static buildUniV3SellHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIUniswapV3ABI,
      eventName: "Sell",
      parseEvent: (args) => ({ tokensIn: args.tokensIn, ethOut: args.ethOut }),
    });
  }

  public static buildZoraSellHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIZoraMultiHopABI,
      eventName: "Sell",
      parseEvent: (args) => ({ tokensIn: args.tokensIn, ethOut: args.ethOut }),
    });
  }

  public static buildApeStoreSellHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIApeStoreABI,
      eventName: "Sell",
      parseEvent: (args) => ({ tokensIn: args.tokensIn, ethOut: args.ethOut }),
    });
  }

  public static buildVirtualTokenSellHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIVirtualsHopABI,
      eventName: "Sell",
      parseEvent: (args) => ({ tokensIn: args.tokensIn, ethOut: args.ethOut }),
    });
  }
}
