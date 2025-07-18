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

      // If ETH > 0 was spent, update balances and handle success
      if (ethInBN > 0n) {
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
                ethInBN,
                tokensReceivedBN
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
                  tokenData.address
                );
              const bonusPercent = tokenWL?.bonusPointsPercent || 0;
              await ctx.services.userService.updateUserPoints({
                userId,
                ethVolumeWei: ethInBN,
                bonusPercent,
              });
            } catch (error) {
              logger.error(`Error updating user points: ${error}`);
            }

            try {
              await ctx.services.userService.updateUserVolumeBuy(
                userId,
                ethInBN
              );
            } catch (error) {
              logger.error(`Error updating user volume: ${error}`);
            }
          });

          // 5. Register in BuyEvent if exists (in background)
          if (ctx.chat?.id) {
            const groupChatId = ctx.chat.id.toString();
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
                logger.error(
                  `Error registering purchase in buy event: ${error}`
                );
              }
            });
          }
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
    ethInBN: bigint,
    tokensReceivedBN: bigint
  ): Promise<void> {
    try {
      // Create trade record
      const newTrade = await ctx.services.tradeService.createBuyTrade({
        userId,
        tokenId: tokenData.id,
        walletId: wallet.id,
        txHash,
        ethSpent: ethInBN,
        tokensReceived: tokensReceivedBN,
      });

      // Update PnL after trade is created
      await new PnlServiceWithCache().updatePnlForTrade(ctx, newTrade.id);
      await new PnlServiceWithCache().updateUserPnlCacheInBackground(
        ctx,
        userId
      );

      logger.info(
        `User ${userId} buy transaction processed. Trade ID: ${newTrade.id}`
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
