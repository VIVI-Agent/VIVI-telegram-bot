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
 * BuyHandlers: Static class that provides "parseLogsFn" and "onMinedFn" functions for different DEX
 * and detects transaction info (ethIn, tokensOut, etc.).
 */
export class BuyHandlers {
  /**
   * Builds generic handlers for a DEX (UniswapV2, Aero, UniswapV3),
   * allowing an isGroup flag to customize log presentation.
   */
  public static buildGenericBuyHandlers(params: {
    ctx: GlobalSceneContext;
    tokenData: Token;
    userId: number;
    walletId: number;
    txHash: Address;
    abi: any;
    eventName: string;
    parseEvent: (args: any) => { ethIn: bigint; tokensOut: bigint };
    isGroup?: boolean;
    onTransactionSuccess?: () => Promise<void>; // Callback para notificar éxito
  }) {
    const {
      ctx,
      tokenData,
      walletId,
      userId,
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
          const { ethIn, tokensOut } = parseEvent(event.args);

          // Format amounts with max 4 decimal places
          const ethInFormatted = parseFloat(formatUnits(ethIn, 18)).toFixed(4);
          const tokensOutFormatted = parseFloat(
            formatUnits(tokensOut, tokenData.decimals)
          ).toFixed(4);

          if (isGroup) {
            // Summarized presentation for groups
            details += `\nReceived: ${tokensOutFormatted} ${tokenData.symbol}`;
          } else {
            // More detailed presentation for private chat
            details += `- Token: ${tokenData.name}`;
            details += `\n- Ξ In: ${ethInFormatted}`;
            details += `\n- Received: ${tokensOutFormatted} ${tokenData.symbol}\n`;
          }
        } catch {}
      }
      return details;
    };

    // onMinedFn => updates DB, creates trade, etc.
    const onMinedFn = async (receipt: TransactionReceipt) => {
      let ethInBN = 0n;
      let tokensReceivedBN = 0n;

      // Extract ethIn and tokensOut
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi,
            eventName,
            data: log.data,
            topics: log.topics,
          });
          const result = parseEvent(event.args);
          ethInBN = result.ethIn;
          tokensReceivedBN = result.tokensOut;
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
          // Validate tokenData has required fields
          if (!tokenData.address || !wallet.address) {
            logger.warn(
              `Skipping balance update: missing token address (${tokenData.address}) or wallet address (${wallet.address})`
            );
            return false;
          }

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

      // **Register in BuyEvent if exists**
      if (ctx.chat?.id && ethInBN > 0n) {
        const groupChatId = ctx.chat.id.toString();

        // Register purchase in active event (if exists) using the service
        setImmediate(async () => {
          try {
            const { Prisma } = await import("@prisma/client");
            const registered =
              await ctx.services.buyEventService.registerPurchaseInActiveEvent(
                tokenData.id,
                groupChatId,
                userId,
                wallet.id,
                txHash,
                new Prisma.Decimal(ethInBN.toString()),
                new Prisma.Decimal(tokensReceivedBN.toString())
              );

            if (registered) {
              logger.info(
                `Purchase registered in active buy event for user ${userId}`
              );
            }
          } catch (error) {
            logger.error(`Error registering purchase in buy event: ${error}`);
          }
        });
      }

      // If ETH > 0 was spent, update trade and user
      if (ethInBN > 0n) {
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
            const newTrade = await ctx.services.tradeService.createBuyTrade({
              userId,
              tokenId: tokenData.id,
              walletId: wallet.id,
              txHash,
              ethSpent: ethInBN,
              tokensReceived: tokensReceivedBN,
            });

            // Now update PnL after holding is confirmed to be updated
            await new PnlServiceWithCache().updatePnlForTrade(ctx, newTrade.id);
            logger.info(`User ${userId} buy transaction processed.`);
          } catch (err) {
            logger.error("createBuyTrade failed in background:", err);
          }
        });

        setImmediate(async () => {
          // update user points
          try {
            const tokenWL =
              await ctx.services.feeWhitelistService.getTokenWhitelist(
                tokenData.address
              );
            const bonusPercent = tokenWL?.bonusPointsPercent || 0;
            await ctx.services.userService.updateUserPoints({
              userId,
              ethVolumeWei: ethInBN,
              bonusPercent,
            });
          } catch (error) {
            logger.error(`Error updating user points/volume: ${error}`);
          }

          try {
            await ctx.services.userService.updateUserVolumeBuy(userId, ethInBN);
          } catch (error) {
            logger.error(`Error updating user volume: ${error}`);
          }

          try {
            // Update local ETH balance
            const newEthBalanceBN = await getWalletBalance(
              wallet.address as Address
            );
            await ctx.services.walletService.updateWalletBalance(
              wallet.id,
              newEthBalanceBN
            );
          } catch (error) {
            logger.error(`Error updating wallet balance: ${error}`);
          }
        });

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
  public static buildUniV2BuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIUniswapV2ABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }

  public static buildAeroBuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIAerodromeABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }

  public static buildUniV3BuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIUniswapV3ABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }

  public static buildZoraBuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIZoraMultiHopABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }

  public static buildApeStoreBuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIApeStoreABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }

  public static buildVirtualTokenBuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIVirtualsHopABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }
}
