import { logger } from "@logger";
import { GlobalSceneContext } from "../../types";
import { Address, decodeEventLog, formatUnits, TransactionReceipt } from "viem";
import { Token } from "@prisma/client";
// getTokenBalance and getWalletBalance are no longer used here
// Balance updates are now handled in TradeSubScene.handleTransactionSuccess
import {
  VIVIAerodromeABI,
  VIVIApeStoreABI,
  VIVIUniswapV2ABI,
  VIVIUniswapV3ABI,
  VIVIUniswapV4ABI,
  VIVIVirtualsHopABI,
  VIVIZoraMultiHopABI,
} from "@abis";

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
    contractAddress?: Address; // Add contract address for filtering
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
      contractAddress,
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
          // Filter logs by contract address if provided
          if (
            contractAddress &&
            log.address.toLowerCase() !== contractAddress.toLowerCase()
          ) {
            continue;
          }

          const event = decodeEventLog({
            abi,
            eventName,
            data: log.data,
            topics: log.topics,
          });

          const result = parseEvent(event.args);
          ethInBN = result.ethIn;
          tokensReceivedBN = result.tokensOut;
          break; // Exit after finding the first matching event
        } catch (error) {
          // Silently continue to next log
        }
      }

      const wallet = await ctx.services.walletService.getWalletById(walletId);

      if (!wallet) {
        logger.error(`No wallet found with id ${walletId} for user ${userId}`);
        return;
      }

      // Update holding first (synchronously to avoid race conditions)
      // Balance updates are now handled in TradeSubScene.handleTransactionSuccess
      // to avoid duplication and ensure all wallets are updated consistently
      const holdingUpdated = true; // Always true since we're not updating here anymore

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
        // Create trade record synchronously
        try {
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

          // 🎯 Clear PnL cache for the user (adapted for fix/trade-balances)
          try {
            await ctx.services.pnlCacheService.clearUserPnlCache(userId);
            logger.debug(`[BuyHandlers] Cleared PnL cache for user ${userId}`);
          } catch (error) {
            logger.error(`[BuyHandlers] Error clearing PnL cache:`, error);
          }

          logger.info(`User ${userId} buy transaction processed.`);
        } catch (err) {
          logger.error("createBuyTrade failed:", err);
        }

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
      } else {
        logger.warn(`No ETH spent in transaction for user ${userId}`);
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

  public static buildUniswapV4BuyHandlers(
    ctx: GlobalSceneContext,
    tokenData: Token,
    userId: number,
    walletId: number,
    txHash: Address,
    isGroup?: boolean,
    onTransactionSuccess?: () => Promise<void>
  ) {
    // Import contracts config to get V4 contract address
    const { contracts } = require("@config");
    const v4ContractAddress =
      contracts.FEE_SWAP_WRAPPER_V4_ZORA_HOOK as Address;

    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIUniswapV4ABI,
      eventName: "Buy",
      contractAddress: v4ContractAddress,
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }
}
