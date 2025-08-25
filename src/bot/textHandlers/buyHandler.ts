// src/bot/textHandlers/buyHandler.ts
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import {
  Address,
  Hash,
  isAddress,
  parseEther,
  TransactionReceipt,
  formatEther,
} from "viem";
import {
  AddressValidator,
  BuyAmountValidator,
  CONNECTOR_WORDS,
  MULTI_WORD_ALIASES,
  TOKEN_ALIASES,
  normalizeAmount,
  selectBestPool,
} from "@utils";
import { TextHandler, TextMatch } from "./types";
import { GENERIC_ERRORS } from "@texts";
import { publicClientQuickNode } from "../../client/viemClient";
import { getBestDexForBuyEthToToken } from "../../blockchain/services/priceComparison/priceComparisonService";
import {
  buyToken,
  buyTokenAerodrome,
  buyTokenV3,
  buyTokenZoraMultiHop,
  buyTokenVIVIApeStore,
  buyTokenVirtualToken,
  buyTokenV4,
} from "../../blockchain/services/swap";
import { findOrCreateToken } from "../../blockchain/services/token";
import { BuyHandlers } from "../scenes/trade/BuyHandlers";
import { replyTxNotificationsWithLinks } from "../../blockchain/services/swap/txNotifications";
import { calculateFinalFee } from "../../utils/feeDiscounts";
import { Token, User } from "@prisma/client";
import { getTokenBalance, getWalletBalance } from "@blockchain";
import { WalletWithHoldings } from "@domain";
import { getDexscreenerTokenPools } from "@services";

const logPrefix = "[buyTextHandler]";

interface ParsedBuyCommand {
  amount: string;
  token: string;
  tokenAddress?: Address;
}

interface LiquidityInfo {
  liquidityUsd?: number;
  poolUrl?: string;
  isLowLiquidity: boolean;
  warningLevel: "none" | "moderate" | "low" | "very_low" | "unknown";
  hasLiquidityData: boolean;
}

/**
 * Get liquidity information from Dexscreener for the best DEX
 */
async function getLiquidityInfo(
  tokenAddress: Address,
  bestDexName: string
): Promise<LiquidityInfo> {
  // Special case for ApeStore - it doesn't appear in Dexscreener
  if (bestDexName === "ApeStore") {
    return {
      isLowLiquidity: true,
      warningLevel: "unknown",
      hasLiquidityData: false,
      poolUrl: `https://ape.store/base/${tokenAddress}`,
    };
  }

  try {
    const pools = await getDexscreenerTokenPools("base", tokenAddress);
    const chosenPool = selectBestPool(pools, bestDexName, tokenAddress);

    if (!chosenPool || !chosenPool.liquidity?.usd) {
      return {
        isLowLiquidity: true,
        warningLevel: "unknown",
        hasLiquidityData: false,
      };
    }

    const liquidityUsd = chosenPool.liquidity.usd;
    const poolUrl = chosenPool.url;

    let warningLevel: "none" | "moderate" | "low" | "very_low" = "none";
    let isLowLiquidity = false;

    if (liquidityUsd < 1000) {
      warningLevel = "very_low";
      isLowLiquidity = true;
    } else if (liquidityUsd < 5000) {
      warningLevel = "low";
      isLowLiquidity = true;
    } else if (liquidityUsd < 10000) {
      warningLevel = "moderate";
      isLowLiquidity = true;
    }

    return {
      liquidityUsd,
      poolUrl,
      isLowLiquidity,
      warningLevel,
      hasLiquidityData: true,
    };
  } catch (error) {
    logger.error(`${logPrefix} Error getting liquidity info:`, error);
    return {
      isLowLiquidity: true,
      warningLevel: "unknown",
      hasLiquidityData: false,
    };
  }
}

/**
 * Show liquidity warning and confirmation message for private chats
 */
async function showLiquidityConfirmation(
  ctx: GlobalSceneContext,
  tokenInfo: Token,
  amountEth: string,
  liquidityInfo: LiquidityInfo,
  bestDexName: string,
  bestDex: any,
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>
): Promise<boolean> {
  try {
    let liquidityLine = "";
    let warningEmoji = "";
    let warningText = "";

    if (
      liquidityInfo.hasLiquidityData &&
      liquidityInfo.liquidityUsd !== undefined
    ) {
      const liquidityFormatted = liquidityInfo.liquidityUsd.toLocaleString(
        "en-US",
        {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }
      );

      liquidityLine = `💧 <b>Liquidity:</b> $${liquidityFormatted}`;

      switch (liquidityInfo.warningLevel) {
        case "very_low":
          warningEmoji = "🚨";
          warningText = "Very Low Liquidity (&lt;1K USD)";
          break;
        case "low":
          warningEmoji = "⚠️";
          warningText = "Low Liquidity (&lt;5K USD)";
          break;
        case "moderate":
          warningEmoji = "💡";
          warningText = "Moderate Liquidity (&lt;10K USD)";
          break;
        default:
          return true; // No warning needed
      }
    } else {
      // Unknown liquidity case
      if (bestDexName === "ApeStore") {
        liquidityLine = `💧 <b>Liquidity:</b> <a href="https://ape.store/base/${tokenInfo.address}">Check ApeStore 🍌</a>`;
        warningEmoji = "";
        warningText = "";
      } else {
        liquidityLine = `💧 <b>Liquidity:</b>`;
        warningEmoji = "💡";
        warningText = "Not available yet - token may be recently deployed";
      }
    }

    // Format DEX name similar to messages.ts
    let dexName = "";
    const feeTier = ""; // We don't have fee tier info in this context

    if (bestDexName === "ZoraMultiHop") {
      dexName = `🦄 ZoraToken | 1%`;
    } else if (bestDexName === "ApeStore") {
      dexName = `🍌 ApeStore | 1%`;
    } else if (bestDexName === "VirtualToken") {
      dexName = `🦄 VirtualToken ${feeTier}`;
    } else {
      const emoji = bestDexName.includes("Uniswap") ? "🦄" : "✈️";
      dexName = `${emoji} ${bestDexName} ${feeTier}`;
    }

    // Build social links similar to messages.ts
    const socialLinks = buildSocialLinksForBuyHandler(
      tokenInfo.address,
      bestDexName,
      liquidityInfo.poolUrl
    );

    // Format the output amount with thousand separators (commas) and 4 decimals
    const rawAmount = parseFloat(bestDex.formattedOut);
    const outputAmount = rawAmount.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });

    const message = `<b>${
      tokenInfo.symbol
    }</b> <a href="https://basescan.org/token/${tokenInfo.address}">🔗BASE</a>
<code>${tokenInfo.address}</code>

${dexName}
${liquidityLine} ${warningEmoji} <i>${warningText}</i>

<b>Swap Info:</b>
💸 <b>Buy:</b> ${amountEth} Ξ
💰 <b>Out:</b> ${outputAmount} ${tokenInfo.symbol}

${
  bestDexName === "ApeStore"
    ? ""
    : `<i>⚠️ ${
        liquidityInfo.hasLiquidityData
          ? "This pool has low liquidity which may result in high slippage or failed transactions."
          : "Liquidity information is not available. This token may be recently deployed or have limited trading activity."
      } Do you want to proceed?</i>`
}

${socialLinks}`;

    // Store overrideAdditionalFeeReceivers in session for later use
    const callbackId = `buy_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    ctx.session.pendingBuyConfirmations =
      ctx.session.pendingBuyConfirmations || {};
    ctx.session.pendingBuyConfirmations[callbackId] = {
      tokenAddress: tokenInfo.address,
      amountEth,
      overrideAdditionalFeeReceivers:
        overrideAdditionalFeeReceivers || undefined,
    };

    const callbackData = `buy_confirm:${callbackId}`;
    logger.info(
      `${logPrefix} Generated callback data: ${callbackData} (length: ${callbackData.length})`
    );

    // Check if callback_data is too long (Telegram limit is 64 bytes)
    if (callbackData.length > 64) {
      logger.error(
        `${logPrefix} Callback data too long: ${callbackData.length} bytes`
      );
    }

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "✅ Proceed with Trade",
            callback_data: callbackData,
          },
          {
            text: "❌ Cancel",
            callback_data: "buy_cancel",
          },
        ],
      ],
    };

    await ctx.reply(message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: ctx.message?.message_id! },
    });

    return false; // Don't proceed with trade yet
  } catch (error) {
    logger.error(`${logPrefix} Error showing liquidity confirmation:`, error);
    return true; // Proceed with trade if error
  }
}

/**
 * Create transaction success callback for text handlers
 * Updates balances for the selected wallet only
 */
function createTextHandlerTransactionSuccessCallback(
  ctx: GlobalSceneContext,
  wallet: any,
  tokenData: Token,
  userId: number
): () => Promise<void> {
  return async () => {
    try {
      logger.info(
        `[buyTextHandler] 🚀 STARTING transaction success callback for user ${userId}, wallet ${wallet.id}, token ${tokenData.symbol}`
      );

      try {
        await handleRefreshFull(ctx, userId);
      } catch (error) {
        logger.error(`[buyTextHandler] Error refreshing full:`, error);
      }

      // Step 2: Update ETH balance for the selected wallet
      const newEthBalanceBN = await getWalletBalance(wallet.address as Address);
      await ctx.services.walletService.updateWalletBalance(
        wallet.id,
        newEthBalanceBN
      );
      logger.info(
        `[buyTextHandler] Updated ETH balance for wallet ${wallet.id}: ${newEthBalanceBN}`
      );

      // Step 3: Update token balance with retry until blockchain balance is > 0
      const maxRetries = 15;
      const retryDelay = 100; // 100ms between retries
      let tokenBalanceBN = 0n;
      let retryCount = 0;

      while (retryCount < maxRetries && tokenBalanceBN === 0n) {
        tokenBalanceBN = await getTokenBalance(
          tokenData.address as Address,
          wallet.address as Address
        );

        logger.info(
          `[buyTextHandler] Attempt ${
            retryCount + 1
          }: Blockchain balance for wallet ${wallet.id}, token ${
            tokenData.symbol
          }: ${tokenBalanceBN}`
        );

        if (tokenBalanceBN > 0n) {
          logger.info(
            `[buyTextHandler] Found balance > 0 for wallet ${wallet.id}: ${tokenBalanceBN}`
          );
          break;
        } else {
          logger.warn(
            `[buyTextHandler] Balance still 0 for wallet ${wallet.id}, retrying...`
          );
          retryCount++;
          if (retryCount < maxRetries) {
            logger.info(`[buyTextHandler] Retrying in ${retryDelay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      // Only create/update holding if balance > 0
      if (tokenBalanceBN > 0n) {
        logger.info(
          `[buyTextHandler] Creating/updating holding - userId: ${userId}, tokenId: ${tokenData.id}, walletId: ${wallet.id}, balance: ${tokenBalanceBN}`
        );
        try {
          await ctx.services.holdingService.updateHoldingFromChain({
            userId: userId,
            tokenId: tokenData.id,
            walletId: wallet.id,
            newBalance: tokenBalanceBN,
          });
          logger.info(
            `[buyTextHandler] ✅ Successfully updated token balance for wallet ${wallet.id}, token ${tokenData.symbol}: ${tokenBalanceBN}`
          );
        } catch (holdingError) {
          logger.error(
            `[buyTextHandler] ❌ Failed to update holding:`,
            holdingError
          );
        }
      } else {
        logger.warn(
          `[buyTextHandler] ⚠️  Skipping holding update for wallet ${wallet.id}, token ${tokenData.symbol}: balance is 0`
        );
      }

      // Removed PnL cache clearing

      logger.info(
        `[buyTextHandler] 🎉 Transaction success callback COMPLETED for user ${userId}`
      );
    } catch (error) {
      logger.error(
        `[buyTextHandler] ❌ ERROR in transaction success callback for user ${userId}:`,
        error
      );
    }
  };
}

/**
 * Parse buy command text to extract amount and token
 * Handles formats like:
 * - buy 0.1 BOBR
 * - buy 100 bife
 * - buy 50 baby sato
 * - buy 0.01 of USDC
 */
function parseBuyCommand(commandText: string): ParsedBuyCommand | null {
  try {
    // Remove "buy" prefix and trim
    const text = commandText.replace(/^buy\s+/i, "").trim();
    if (!text) return null;

    // Split by spaces and filter out connector words
    const words = text
      .split(/\s+/)
      .filter((word) => !CONNECTOR_WORDS.includes(word.toLowerCase()));

    if (words.length < 2) return null;

    const amount = words[0];
    const tokenWords = words.slice(1);

    // Handle multi-word tokens
    let token: string;
    if (tokenWords.length > 1) {
      // Check if it's a known multi-word alias
      const multiWordToken = tokenWords.join(" ").toLowerCase();
      if (MULTI_WORD_ALIASES[multiWordToken]) {
        token = multiWordToken;
      } else {
        // Treat as single token (last word)
        token = tokenWords[tokenWords.length - 1];
      }
    } else {
      token = tokenWords[0];
    }

    return {
      amount,
      token: token.toLowerCase(),
    };
  } catch (error) {
    logger.error(`${logPrefix} Error parsing buy command:`, error);
    return null;
  }
}

/**
 * Resolve token symbol/alias to actual token information
 */
async function resolveTokenInfo(
  ctx: GlobalSceneContext,
  parsed: ParsedBuyCommand,
  wallet: any
): Promise<Token | null> {
  try {
    let tokenAddress: Address;
    let symbol: string;

    // Check single-word aliases first
    if (TOKEN_ALIASES[parsed.token]) {
      tokenAddress = TOKEN_ALIASES[parsed.token];
      symbol = parsed.token.toUpperCase();
      logger.debug(
        `${logPrefix} Resolved alias: ${parsed.token} -> ${tokenAddress}`
      );
    }
    // Check multi-word aliases
    else if (MULTI_WORD_ALIASES[parsed.token]) {
      tokenAddress = MULTI_WORD_ALIASES[parsed.token];
      symbol = parsed.token.toUpperCase();
      logger.debug(
        `${logPrefix} Resolved multi-word alias: ${parsed.token} -> ${tokenAddress}`
      );
    }
    // Check if it's a valid address
    else if (isAddress(parsed.token)) {
      tokenAddress = parsed.token.toLowerCase() as Address;
      symbol = parsed.token.toUpperCase();
      logger.debug(`${logPrefix} Using address directly: ${tokenAddress}`);
    }
    // Check whitelist tokens
    else {
      const tokens =
        await ctx.services.feeWhitelistService.getAllTokenWhitelist(ctx);

      const tokenData = findTokenBySymbol(tokens, parsed.token);
      if (tokenData) {
        tokenAddress = tokenData.address.toLowerCase() as Address;
        symbol = tokenData.symbol;
        logger.debug(
          `${logPrefix} Found in whitelist: ${symbol} -> ${tokenAddress}`
        );
      } else {
        await ctx.reply(
          `❌ Token "${parsed.token}" not found. Please use a valid token symbol or address.`,
          {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message?.message_id! },
          }
        );
        return null;
      }
    }

    // Get or create token record
    const tokenData = await findOrCreateToken(ctx, tokenAddress);

    if (!tokenData) {
      await ctx.reply("❌ Failed to get token information. Please try again.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return null;
    }

    return tokenData;
  } catch (error) {
    logger.error(`${logPrefix} Error resolving token info:`, error);
    await ctx.reply("❌ Error resolving token information. Please try again.", {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message?.message_id! },
    });
    return null;
  }
}

/**
 * Validate user has sufficient ETH balance for the buy
 */
async function validateEthBalance(
  ctx: GlobalSceneContext,
  amountEth: bigint,
  wallet: any
): Promise<boolean> {
  try {
    const walletRecord = await ctx.services.walletService.getWalletById(
      wallet.id
    );
    if (!walletRecord) {
      await ctx.reply("❌ Wallet not found.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return false;
    }

    const ethBalance = BigInt(walletRecord.balance);
    if (ethBalance < amountEth) {
      await ctx.reply(
        `❌ Insufficient ETH balance. You have ${formatEther(
          ethBalance
        )} ETH, need ${formatEther(amountEth)} ETH.`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return false;
    }
    return true;
  } catch (error) {
    logger.error(`${logPrefix} Error checking ETH balance:`, error);
    await ctx.reply("❌ Error checking ETH balance. Please try again.", {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message?.message_id! },
    });
    return false;
  }
}

/**
 * Execute the buy transaction
 */
async function executeBuyCommand(
  ctx: GlobalSceneContext,
  parsed: ParsedBuyCommand,
  wallet: any,
  tokenInfo: Token,
  amountEth: bigint,
  user: User,
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>,
  skipLiquidityCheck: boolean = false
): Promise<void> {
  try {
    // Set slippage
    const slippagePercent = 50;
    const tokenAddress = tokenInfo.address as Address;
    // Find best DEX
    const feeTiers = [100, 500, 3000, 10000];
    const { best } = await getBestDexForBuyEthToToken({
      publicClient: publicClientQuickNode,
      tokenOut: tokenAddress,
      decimalsOut: tokenInfo.decimals,
      feeTiers,
      amountEth,
    });

    if (!best) {
      throw new Error(
        "No liquidity found on UniswapV2, V3, Aerodrome, Zora or Apestore Pools"
      );
    }

    const bestDex = best.dexName;
    logger.info(
      `${logPrefix} Best DEX: ${bestDex}, feeTier: ${best.feeTier || "N/A"}`
    );

    // Check liquidity for private chats only (skip if already confirmed)
    const isPrivateChat = ctx.chat?.type === "private";
    if (isPrivateChat && !skipLiquidityCheck) {
      logger.info(`${logPrefix} Private chat detected, checking liquidity...`);

      const liquidityInfo = await getLiquidityInfo(tokenAddress, bestDex);
      logger.info(`${logPrefix} Liquidity info:`, liquidityInfo);

      if (liquidityInfo.isLowLiquidity || !liquidityInfo.hasLiquidityData) {
        const amountEthFormatted = formatEther(amountEth);
        const shouldProceed = await showLiquidityConfirmation(
          ctx,
          tokenInfo,
          amountEthFormatted,
          liquidityInfo,
          bestDex,
          best,
          overrideAdditionalFeeReceivers
        );

        if (!shouldProceed) {
          logger.info(
            `${logPrefix} User needs to confirm trade (low liquidity or unknown liquidity)`
          );
          return; // Stop execution, wait for user confirmation
        }
      }
    }

    // Calculate fees
    const feePercent = await calculateFinalFee(ctx, tokenAddress, user.id);
    logger.info(`${logPrefix} Final fee percent: ${feePercent}`);

    // Create transaction success callback for balance updates
    const onTransactionSuccess = createTextHandlerTransactionSuccessCallback(
      ctx,
      wallet,
      tokenInfo,
      user.id
    );

    // Execute buy based on best DEX
    let txHash: Hash;
    let waitReceipt: Promise<TransactionReceipt>;

    const wid = wallet.id;

    if (bestDex === "UniswapV2") {
      const result = await buyToken({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildUniV2BuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false, // isGroup = false for individual buys
        onTransactionSuccess
      );

      logger.info(`${logPrefix} UniV2 TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex.startsWith("Aerodrome")) {
      const stable = bestDex === "AerodromeStable";
      const result = await buyTokenAerodrome({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        stable,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildAeroBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} Aerodrome TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "UniswapV3") {
      if (!best.feeTier) throw new Error("Missing fee tier");

      const result = await buyTokenV3({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        bestDex: best,
        feePercent,
        feeTier: best.feeTier,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildUniV3BuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} UniV3 TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "ZoraMultiHop") {
      const result = await buyTokenZoraMultiHop({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildZoraBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} ZoraMultiHop TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "ApeStore") {
      const result = await buyTokenVIVIApeStore({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildApeStoreBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} ApeStore TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "VirtualToken") {
      const result = await buyTokenVirtualToken({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildVirtualTokenBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} VirtualToken TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "UniswapV4") {
      const result = await buyTokenV4({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildUniswapV4BuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} UniswapV4 TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else {
      throw new Error("Unsupported DEX");
    }

    logger.info(`${logPrefix} Buy completed for ${user.id}`);
  } catch (error) {
    logger.error(`${logPrefix} Buy execution error:`, error);
    throw error;
  }
}

/**
 * Finds a token in the token list by symbol, with special handling for $ prefixes
 * @param tokens Array of token objects to search
 * @param symbolOrCA Symbol or contract address to search for
 * @returns The matching token or undefined if not found
 */
function findTokenBySymbol<T extends { symbol: string }>(
  tokens: T[] | undefined,
  symbolOrCA: string
): T | undefined {
  if (!tokens || tokens.length === 0) {
    return undefined;
  }

  // Trim y convertir a minúsculas
  const lowerValue = symbolOrCA.toLowerCase().trim();

  // Direct match primero (con trim)
  const directMatch = tokens.find(
    (t) => t.symbol.toLowerCase().trim() === lowerValue
  );

  if (directMatch) return directMatch;

  // Probar con $ añadido si la entrada no lo tiene
  if (!lowerValue.startsWith("$")) {
    const withDollarMatch = tokens.find(
      (t) => t.symbol.toLowerCase().trim() === `$${lowerValue}`
    );

    if (withDollarMatch) return withDollarMatch;
  }

  // Probar con $ eliminado si la entrada lo tiene
  if (lowerValue.startsWith("$")) {
    const withoutDollarMatch = tokens.find(
      (t) => t.symbol.toLowerCase().trim() === lowerValue.substring(1)
    );

    if (withoutDollarMatch) return withoutDollarMatch;
  }

  // Comparación insensible a mayúsculas/minúsculas ignorando el prefijo $
  return tokens.find((t) => {
    const tokenSymbol = t.symbol.toLowerCase().trim();
    const withoutDollarSymbol = tokenSymbol.startsWith("$")
      ? tokenSymbol.substring(1)
      : tokenSymbol;
    const withoutDollarInput = lowerValue.startsWith("$")
      ? lowerValue.substring(1)
      : lowerValue;

    return withoutDollarSymbol === withoutDollarInput;
  });
}

/**
 * Buy text handler - handles individual buy commands
 * Handles formats like:
 * - buy 0.1 BOBR
 * - buy 100 bife
 * - buy 50 baby sato
 * - buy 0.01 of USDC
 */
export const buyTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch,
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>
): Promise<boolean> => {
  try {
    logger.debug(
      `${logPrefix} Processing buy command with params:`,
      match.params
    );
    const tgUsername = ctx.from?.username;
    const tgUserId = ctx.from?.id;

    logger.info(
      `${logPrefix} Context debug - tgUsername: ${tgUsername}, tgUserId: ${tgUserId}`
    );

    if (!tgUserId) {
      await ctx.reply("❌ User ID not found. Please try again.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // Use tgUserId instead of tgUsername for more reliable user lookup
    const user = await ctx.services.userService.getUserByTgId(
      tgUserId.toString()
    );
    logger.info(
      `${logPrefix} User found by tgUserId: ${user?.id} (tgUserId: ${tgUserId}, tgUsername: ${user?.tgUsername})`
    );
    if (!user) {
      await ctx.reply(GENERIC_ERRORS.USER_NOT_FOUND, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
        link_preview_options: { is_disabled: true },
      });
      return true;
    }

    // Parse the command from the full match
    const commandText = match.params.fullMatch as string;
    const parsed = parseBuyCommand(commandText);

    if (!parsed) {
      await ctx.reply(
        "❌ Invalid buy format. Examples:\n" +
          "• buy 0.1 BOBR\n" +
          "• buy 100 bife\n" +
          "• buy 50 baby sato\n" +
          "• buy 0.01 of USDC",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    logger.info(`${logPrefix} Parsed command:`, parsed);

    // Get user's selected wallet with holdings
    const userWithWallet =
      await ctx.services.userService.getUserWithSelectedWalletAndHoldingsByUserId(
        user.id
      );
    if (!userWithWallet?.wallets?.[0]) {
      await ctx.reply("❌ No wallet found. Please create a wallet first.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    const wallet = userWithWallet.wallets[0];

    // Parse and validate ETH amount
    let amountEth: bigint;
    try {
      const normalizedAmount = normalizeAmount(parsed.amount);
      amountEth = parseEther(normalizedAmount);
      if (amountEth <= 0n) {
        throw new Error("Invalid ETH amount");
      }
      logger.info(`${logPrefix} Buy amount: ${formatEther(amountEth)} ETH`);
    } catch (error) {
      await ctx.reply(
        "❌ Invalid ETH amount. Please use a valid number (e.g., 0.1, 1.5).",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    // Resolve token symbol/address to actual token info
    const tokenInfo = await resolveTokenInfo(ctx, parsed, wallet);
    if (!tokenInfo) {
      return true; // Error message already sent
    }

    // Validate ETH balance
    if (!(await validateEthBalance(ctx, amountEth, wallet))) {
      return true; // Error message already sent
    }

    // Execute the buy transaction
    await executeBuyCommand(
      ctx,
      parsed,
      wallet,
      tokenInfo,
      amountEth,
      user,
      overrideAdditionalFeeReceivers,
      false // skipLiquidityCheck = false for initial execution
    );

    return true; // Successfully handled
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    await ctx.reply(
      `❌ Buy failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      }
    );

    return true; // We handled it (even if with error)
  }
};

async function handleRefreshFull(
  ctx: GlobalSceneContext,
  userId: number
): Promise<void> {
  try {
    // Use the provided userId instead of ctx.user.id to ensure consistency
    const user = await ctx.services.userService.getUserById(userId);
    if (!user) return;

    const wallets = await ctx.services.walletService.getUserWalletsWithHoldings(
      user.id
    );

    if (!wallets) {
      logger.warn(`[buyTextHandler] No wallets found for user ${userId}`);
      return;
    }

    // Process all wallets in parallel
    await Promise.all(
      wallets.map(async (wallet: WalletWithHoldings) => {
        try {
          // Update ETH balance
          const ethBalance = await getWalletBalance(wallet.address as Address);

          await ctx.services.walletService.updateWalletBalance(
            wallet.id,
            ethBalance
          );

          const holdings = wallet.holdings;

          // Update token balances in parallel
          await Promise.all(
            holdings.map(async (holding) => {
              try {
                const token = holding.token;
                const chainBalance = await getTokenBalance(
                  token.address as Address,
                  wallet.address as Address
                );

                if (chainBalance !== BigInt(holding.balance)) {
                  await ctx.services.holdingService.updateHoldingFromChain({
                    userId: userId, // Use the provided userId parameter
                    tokenId: token.id,
                    walletId: wallet.id,
                    newBalance: chainBalance,
                  });
                }
              } catch (err) {
                // Continue with other tokens even if one fails
              }
            })
          );
        } catch (err) {
          // Continue with other wallets even if one fails
        }
      })
    );

    return;
  } catch (error) {
    logger.error(
      `[buyTextHandler] Error in handleRefreshFull for user ${userId}:`,
      error
    );
    return;
  }
}

/**
 * Build social links string for buy handler (similar to messages.ts)
 */
function buildSocialLinksForBuyHandler(
  address: string,
  bestDexName?: string,
  poolUrl?: string
): string {
  const defaultLinks = [
    `<a href="https://basescan.org/token/${address}">BScan</a>`,
    `<a href="https://www.geckoterminal.com/base/pools/${address}">CG</a>`,
    `<a href="https://dexscreener.com/base/${address}">DexSc</a>`,
    `<a href="https://www.dextools.io/app/en/base/pair-explorer/${address}">DexT</a>`,
    `<a href="https://www.defined.fi/base/${address}">Def</a>`,
  ];

  // Add Apestore link if bestDexName is "ApeStore"
  if (bestDexName === "ApeStore") {
    defaultLinks.push(`<a href="https://ape.store/base/${address}">Ape</a>`);
  }

  // Add specific pool link if available
  if (poolUrl) {
    defaultLinks.push(`<a href="${poolUrl}">Pool</a>`);
  }

  return defaultLinks.join(" | ");
}

/**
 * Execute buy transaction without liquidity check (for confirmed trades)
 */
async function executeConfirmedBuyCommand(
  ctx: GlobalSceneContext,
  tokenAddress: Address,
  amountEth: bigint,
  user: User,
  wallet: any,
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>
): Promise<void> {
  try {
    logger.info(
      `${logPrefix} Executing confirmed buy command for user ${
        user.id
      }, wallet ${wallet.id}, amount ${formatEther(amountEth)} ETH`
    );

    // Get token info
    const tokenInfo = await findOrCreateToken(ctx, tokenAddress);
    if (!tokenInfo) {
      throw new Error("Token not found");
    }

    // Set slippage
    const slippagePercent = 50;

    // Find best DEX
    const feeTiers = [100, 500, 3000, 10000];
    const { best } = await getBestDexForBuyEthToToken({
      publicClient: publicClientQuickNode,
      tokenOut: tokenAddress,
      decimalsOut: tokenInfo.decimals,
      feeTiers,
      amountEth,
    });

    if (!best) {
      throw new Error("No liquidity found on any DEX");
    }

    const bestDex = best.dexName;
    logger.info(
      `${logPrefix} Best DEX for confirmed buy: ${bestDex}, feeTier: ${
        best.feeTier || "N/A"
      }`
    );

    // Calculate fees
    const feePercent = await calculateFinalFee(ctx, tokenAddress, user.id);
    logger.info(`${logPrefix} Final fee percent: ${feePercent}`);

    // Create transaction success callback for balance updates
    const onTransactionSuccess = createTextHandlerTransactionSuccessCallback(
      ctx,
      wallet,
      tokenInfo,
      user.id
    );

    // Execute buy based on best DEX (same logic as executeBuyCommand but without liquidity check)
    let txHash: Hash;
    let waitReceipt: Promise<TransactionReceipt>;
    const wid = wallet.id;

    if (bestDex === "UniswapV2") {
      const result = await buyToken({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildUniV2BuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} UniV2 TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex.startsWith("Aerodrome")) {
      const stable = bestDex === "AerodromeStable";
      const result = await buyTokenAerodrome({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        stable,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildAeroBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} Aerodrome TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "UniswapV3") {
      if (!best.feeTier) throw new Error("Missing fee tier");

      const result = await buyTokenV3({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        bestDex: best,
        feePercent,
        feeTier: best.feeTier,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildUniV3BuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} UniV3 TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "ZoraMultiHop") {
      const result = await buyTokenZoraMultiHop({
        ctx,
        userId: user.id,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildZoraBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} ZoraMultiHop TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "ApeStore") {
      const result = await buyTokenVIVIApeStore({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildApeStoreBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} ApeStore TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "VirtualToken") {
      const result = await buyTokenVirtualToken({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildVirtualTokenBuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} VirtualToken TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else if (bestDex === "UniswapV4") {
      const result = await buyTokenV4({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        bestDex: best,
        overrideAdditionalFeeReceivers,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildUniswapV4BuyHandlers(
        ctx,
        tokenInfo,
        user.id,
        wid,
        txHash,
        false,
        onTransactionSuccess
      );

      logger.info(`${logPrefix} UniswapV4 TX: ${txHash}`);
      await replyTxNotificationsWithLinks({
        ctx,
        userMessageId: ctx.message?.message_id!,
        txHash,
        waitReceipt,
        parseLogsFn: handlers.parseLogsFn,
        onMinedFn: handlers.onMinedFn,
        swapType: "Buy",
        amountIn: formatEther(amountEth),
        symbol: tokenInfo.symbol,
        tokenAddress,
      });
    } else {
      throw new Error("Unsupported DEX");
    }

    logger.info(`${logPrefix} Confirmed buy completed for ${user.id}`);
  } catch (error) {
    logger.error(`${logPrefix} Confirmed buy execution error:`, error);
    throw error;
  }
}

/**
 * Handle buy confirmation callbacks for low liquidity trades
 */
export async function handleBuyConfirmationCallback(
  ctx: GlobalSceneContext,
  callbackData: string,
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>
): Promise<boolean> {
  try {
    logger.info(
      `${logPrefix} Handling buy confirmation callback: ${callbackData}`
    );

    if (callbackData === "buy_cancel") {
      logger.info(`${logPrefix} User cancelled the trade`);
      await ctx.answerCbQuery("❌ Trade cancelled");
      await ctx.deleteMessage(ctx.callbackQuery?.message?.message_id!);
      return true;
    }

    if (callbackData.startsWith("buy_confirm:")) {
      logger.info(`${logPrefix} User confirmed the trade`);
      const [, callbackId] = callbackData.split(":");

      logger.info(
        `${logPrefix} Parsed callback data - callbackId: ${callbackId}`
      );

      if (!callbackId) {
        logger.error(
          `${logPrefix} Invalid confirmation data - callbackId: ${callbackId}`
        );
        await ctx.answerCbQuery("❌ Invalid confirmation data");
        return true;
      }

      // Get stored confirmation data from session
      const confirmationData =
        ctx.session.pendingBuyConfirmations?.[callbackId];
      if (!confirmationData) {
        logger.error(
          `${logPrefix} No confirmation data found for callbackId: ${callbackId}`
        );
        await ctx.answerCbQuery("❌ Confirmation data not found");
        return true;
      }

      const { tokenAddress, amountEth, overrideAdditionalFeeReceivers } =
        confirmationData;
      logger.info(
        `${logPrefix} Retrieved confirmation data - tokenAddress: ${tokenAddress}, amountEth: ${amountEth}`
      );

      // Delete the confirmation message immediately
      await ctx.deleteMessage(ctx.callbackQuery?.message?.message_id!);
      logger.info(`${logPrefix} Confirmation message deleted immediately`);

      await ctx.answerCbQuery("✅ Proceeding with trade...");

      // Get user info
      const tgUserId = ctx.from?.id;
      if (!tgUserId) {
        await ctx.reply("❌ User ID not found. Please try again.");
        return true;
      }

      const user = await ctx.services.userService.getUserByTgId(
        tgUserId.toString()
      );
      if (!user) {
        await ctx.reply(GENERIC_ERRORS.USER_NOT_FOUND);
        return true;
      }

      // Get user's selected wallet
      const userWithWallet =
        await ctx.services.userService.getUserWithSelectedWalletAndHoldingsByUserId(
          user.id
        );
      if (!userWithWallet?.wallets?.[0]) {
        await ctx.reply("❌ No wallet found. Please create a wallet first.");
        return true;
      }

      const wallet = userWithWallet.wallets[0];

      // Get token info
      const tokenInfo = await findOrCreateToken(ctx, tokenAddress as Address);
      if (!tokenInfo) {
        await ctx.reply("❌ Token not found. Please try again.");
        return true;
      }

      // Parse amount
      const amountEthBN = parseEther(amountEth);

      // Validate ETH balance
      if (!(await validateEthBalance(ctx, amountEthBN, wallet))) {
        return true;
      }

      logger.info(
        `${logPrefix} About to execute buy command for user ${user.id}, wallet ${wallet.id}, token ${tokenInfo.symbol}, amount ${amountEth} ETH`
      );

      // Execute the confirmed buy transaction (without liquidity check)
      await executeConfirmedBuyCommand(
        ctx,
        tokenAddress as Address,
        amountEthBN,
        user,
        wallet,
        overrideAdditionalFeeReceivers
      );

      logger.info(`${logPrefix} Buy command executed successfully`);

      // Clean up session data
      delete ctx.session.pendingBuyConfirmations![callbackId];

      logger.info(`${logPrefix} Session cleaned`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(
      `${logPrefix} Error handling buy confirmation callback:`,
      error
    );
    try {
      await ctx.answerCbQuery("❌ Error processing confirmation");
    } catch (answerError) {
      logger.error(`${logPrefix} Error answering callback query:`, answerError);
    }
    return true;
  }
}
