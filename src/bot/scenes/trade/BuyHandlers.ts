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

          if (isGroup) {
            // Summarized presentation for groups
            details += `\nReceived: ${formatUnits(
              tokensOut,
              tokenData.decimals
            )} ${tokenData.symbol}`;
          } else {
            // More detailed presentation for private chat
            details += `- Token: ${tokenData.name}`;
            details += `\n- Ξ In: ${formatUnits(ethIn, 18)}`;
            details += `\n- Received: ${formatUnits(
              tokensOut,
              tokenData.decimals
            )} ${tokenData.symbol}\n`;
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

      // Update holding in background
      setImmediate(async () => {
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
        } catch (err) {
          logger.error(
            `Background updateHoldingFromChain failed for wallet ${walletId}:`,
            err
          );
        }
      });

      // **Register in BuyEvent if exists**
      // Note: This requires group buy events functionality - uncomment when available
      /*
      const activeEvent = await ctx.prisma.buyEvent.findFirst({
        where: {
          isActive: true,
          tokenId: tokenData.id,
          groupChatId: ctx.chat?.id.toString(),
        },
      });

      if (activeEvent) {
        logger.info(
          `Active event detected: ${activeEvent.name}. Registering purchase...`
        );
        try {
          await ctx.prisma.buyEventPurchase.create({
            data: {
              eventId: activeEvent.id,
              userId,
              walletId: wallet.id,
              txHash,
              ethSpentWei: new Prisma.Decimal(ethInBN.toString()),
              tokensReceivedWei: new Prisma.Decimal(
                tokensReceivedBN.toString()
              ),
            },
          });
          logger.info(
            `Purchase registered in event '${activeEvent.name}' for user ${userId}: ${ethInBN} Wei spent, ${tokensReceivedBN} tokens received.`
          );
        } catch (error) {
          logger.error(
            `Failed to register purchase in active event '${
              activeEvent.name
            }' for user ${userId}: ${
              error instanceof Error ? error.message : error
            }`
          );
        }
      }
      */

      // If ETH > 0 was spent, update trade and user
      if (ethInBN > 0n) {
        setImmediate(async () => {
          try {
            // Create trade record - implement this method in your trade service
            // const newTrade = await ctx.services.tradeService.createBuyTrade({
            //   userId,
            //   tokenId: tokenData.id,
            //   walletId: wallet.id,
            //   txHash,
            //   ethSpent: ethInBN,
            //   tokensReceived: tokensReceivedBN,
            // });
            // await ctx.services.pnlService.updatePnlForTrade(newTrade.id);
            logger.info(`User ${userId} buy transaction processed.`);
          } catch (err) {
            logger.error("createBuyTrade failed in background:", err);
          }
        });

        // Update user points, volume, etc.
        try {
          await ctx.services.userService.updateUserVolumeBuy(userId, ethInBN);
          logger.info(`Updated user ${userId} buy volume: ${ethInBN}`);
        } catch (error) {
          logger.error(`Error updating user volume: ${error}`);
        }

        // Update local ETH balance
        const newEthBalanceBN = await getWalletBalance(
          wallet.address as Address
        );
        await ctx.services.walletService.updateWalletBalance(
          wallet.id,
          newEthBalanceBN
        );
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
    isGroup?: boolean
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
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
    isGroup?: boolean
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
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
    isGroup?: boolean
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
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
    isGroup?: boolean
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
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
    isGroup?: boolean
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
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
    isGroup?: boolean
  ) {
    return this.buildGenericBuyHandlers({
      ctx,
      tokenData,
      userId,
      walletId,
      txHash,
      isGroup,
      abi: VIVIVirtualsHopABI,
      eventName: "Buy",
      parseEvent: (args) => ({ ethIn: args.ethIn, tokensOut: args.tokensOut }),
    });
  }
}
