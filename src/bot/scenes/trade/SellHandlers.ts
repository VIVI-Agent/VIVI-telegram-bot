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
    contractAddress?: Address; // Added for V4 contract address
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
          break; // Exit after finding the first matching event
        } catch {}
      }

      const wallet = await ctx.services.walletService.getWalletById(walletId);

      if (!wallet) {
        logger.error(`No wallet found with id ${walletId} for user ${userId}`);
        return;
      }

      // Balance updates are now handled in TradeSubScene.handleTransactionSuccess
      // to avoid duplication and ensure all wallets are updated consistently
      const holdingUpdated = true; // Always true since we're not updating here anymore

      // If ETH > 0 was received, update trade and user
      if (ethReceivedBN > 0n) {
        // Create trade record synchronously
        try {
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

          // 🎯 Clear PnL cache for the user (adapted for fix/trade-balances)
          try {
            await ctx.services.pnlCacheService.clearUserPnlCache(userId);
            logger.debug(`[SellHandlers] Cleared PnL cache for user ${userId}`);
          } catch (error) {
            logger.error(`[SellHandlers] Error clearing PnL cache:`, error);
          }

          logger.info(`User ${userId} sell transaction processed.`);
        } catch (err) {
          logger.error("createSellTrade failed:", err);
        }

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

  public static buildUniswapV4SellHandlers(
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

    return this.buildGenericSellHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      onTransactionSuccess,
      abi: VIVIUniswapV4ABI,
      eventName: "Sell",
      contractAddress: v4ContractAddress, // Add contract address for filtering
      parseEvent: (args) => ({ tokensIn: args.tokensIn, ethOut: args.ethOut }),
    });
  }
}
