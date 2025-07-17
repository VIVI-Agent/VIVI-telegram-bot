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

      // Update holding first (synchronously to avoid race conditions)
      const holdingUpdatePromise = (async () => {
        try {
          const newOnChainBalanceBN = await getTokenBalance(
            tokenData.address as Address,
            wallet.address as Address
          );
          await ctx.services.holdingService.updateHoldingFromChain({
            userId: userId,
            tokenId: tokenData.id,
            walletId: walletId,
            newBalance: newOnChainBalanceBN,
          });
          logger.info(
            `Updated holding for token ${tokenData.symbol} in wallet ${walletId}`
          );
          return true;
        } catch (err) {
          logger.error(
            `Background updateHoldingFromChain failed for wallet ${walletId}:`,
            err
          );
          return false;
        }
      })();

      // If ETH > 0 was received, update trade and user
      if (ethReceivedBN > 0n) {
        // Wait for holding update before creating trade to avoid race conditions
        setImmediate(async () => {
          try {
            // Wait for holding to be updated first
            const holdingUpdated = await holdingUpdatePromise;

            if (!holdingUpdated) {
              logger.warn(
                `Skipping trade creation due to holding update failure for user ${userId}`
              );
              return;
            }

            // Create trade record
            const newTrade = await ctx.services.tradeService.createSellTrade({
              userId,
              tokenId: tokenData.id,
              walletId: wallet.id,
              txHash,
              tokensSpent: tokensSoldBN,
              ethReceived: ethReceivedBN,
            });

            // Now update PnL after holding is confirmed to be updated
            await new PnlServiceWithCache().updatePnlForTrade(ctx, newTrade.id);
            // Refresca la caché de PnL del usuario para que posiciones se actualice inmediatamente
            await new PnlServiceWithCache().updateUserPnlCacheInBackground(
              ctx,
              userId
            );
            logger.info(`User ${userId} sell transaction processed.`);
          } catch (err) {
            logger.error("createSellTrade failed in background:", err);
          }
        });

        setImmediate(async () => {
          // Update user volume

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
            logger.info(`Updated user ${userId} sell volume: ${ethReceivedBN}`);
          } catch (error) {
            logger.error(`Error updating user volume: ${error}`);
          }
        });

        // Update local ETH balance
        const newEthBalanceBN = await getWalletBalance(
          wallet.address as Address
        );
        await ctx.services.walletService.updateWalletBalance(
          wallet.id,
          newEthBalanceBN
        );

        // Call success callback after all updates are complete
        if (onTransactionSuccess) {
          try {
            await onTransactionSuccess();
            logger.info(
              `Transaction success callback executed for user ${userId}`
            );
          } catch (error) {
            logger.error(`Error in transaction success callback: ${error}`);
          }
        }
      }
    };

    return { parseLogsFn, onMinedFn };
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
