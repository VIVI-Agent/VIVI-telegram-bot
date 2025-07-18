// src/bot/textHandlers/sellHandler.ts
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
  SellAmountValidator,
  CONNECTOR_WORDS,
  MULTI_WORD_ALIASES,
  TOKEN_ALIASES,
  normalizeAmount,
} from "@utils";
import { TextHandler, TextMatch } from "./types";
import { GENERIC_ERRORS } from "@texts";
import { publicClientQuickNode } from "../../client/viemClient";
import { getBestDexForSellTokenToEth } from "../../blockchain/services/priceComparison/priceComparisonServiceSell";
import {
  sellToken,
  sellTokenAerodrome,
  sellTokenV3,
  sellTokenZoraMultiHop,
  sellTokenVIVIApeStore,
  sellTokenVirtualToken,
} from "../../blockchain/services/swap";
import { findOrCreateToken } from "../../blockchain/services/token";
import { replyTxNotificationsWithLinks } from "../../blockchain/services/swap/txNotifications";
import { SellHandlers } from "../scenes/trade/SellHandlers";
import { calculateFinalFee } from "../../utils/feeDiscounts";
import { Token, User } from "@prisma/client";
import { getTokenBalance, getWalletBalance } from "@blockchain";

const logPrefix = "[sellTextHandler]";

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
        `[sellTextHandler] Executing transaction success callback for user ${userId}`
      );

      // Step 1: Update ETH balance for the selected wallet
      const newEthBalanceBN = await getWalletBalance(wallet.address as Address);
      await ctx.services.walletService.updateWalletBalance(
        wallet.id,
        newEthBalanceBN
      );
      logger.info(
        `[sellTextHandler] Updated ETH balance for wallet ${wallet.id}: ${newEthBalanceBN}`
      );

      // Step 2: Update token balance for the selected wallet
      const tokenBalanceBN = await getTokenBalance(
        tokenData.address as Address,
        wallet.address as Address
      );
      await ctx.services.holdingService.updateHoldingFromChain({
        userId: userId,
        tokenId: tokenData.id,
        walletId: wallet.id,
        newBalance: tokenBalanceBN,
      });
      logger.info(
        `[sellTextHandler] Updated token balance for wallet ${wallet.id}, token ${tokenData.symbol}: ${tokenBalanceBN}`
      );

      // Step 3: Clear PnL cache for the user
      await ctx.services.pnlCacheService.clearUserPnlCache(userId);
      logger.info(`[sellTextHandler] Cleared PnL cache for user ${userId}`);

      logger.info(
        `[sellTextHandler] Transaction success callback completed for user ${userId}`
      );
    } catch (error) {
      logger.error(
        `[sellTextHandler] Error in transaction success callback:`,
        error
      );
    }
  };
}

/**
 * Parse sell command text to extract percentage and token
 * Handles formats like:
 * - sell 50 BOBR
 * - sell all bife
 * - sell half baby sato
 * - sell 25% of USDC
 */
function parseSellCommand(
  commandText: string
): { percentage: string; token: string } | null {
  try {
    // Remove "sell" prefix and trim
    const text = commandText.replace(/^sell\s+/i, "").trim();
    if (!text) return null;

    // Split by spaces and filter out connector words
    const words = text
      .split(/\s+/)
      .filter((word) => !CONNECTOR_WORDS.includes(word.toLowerCase()));

    if (words.length < 2) return null;

    const percentage = words[0];
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
      percentage,
      token: token.toLowerCase(),
    };
  } catch (error) {
    logger.error(`${logPrefix} Error parsing sell command:`, error);
    return null;
  }
}

/**
 * Resolve token symbol/alias to actual token information
 */
async function resolveTokenInfo(
  ctx: GlobalSceneContext,
  parsed: { percentage: string; token: string },
  wallet: any
): Promise<{ tokenAddress: Address; symbol: string; decimals: number } | null> {
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

    return {
      tokenAddress,
      symbol,
      decimals: 18, // Default decimals, will be updated from holding
    };
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
 * Validate user has sufficient token balance for the sell
 */
async function validateTokenBalance(
  ctx: GlobalSceneContext,
  tokenAddress: Address,
  wallet: any,
  user: User
): Promise<{ holding: any; tokenData: any } | null> {
  try {
    // Get user's holdings
    const userWithWallet =
      await ctx.services.userService.getUserWithSelectedWalletAndHoldingsByUserId(
        user.id
      );

    if (!userWithWallet?.wallets?.[0]) {
      await ctx.reply("❌ No wallet found. Please create a wallet first.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return null;
    }

    const selectedWallet = userWithWallet.wallets[0];

    // Find holding for this token
    const holding = ctx.services.holdingService.getHoldingBySymbolOrAddress(
      selectedWallet,
      tokenAddress
    );

    if (!holding) {
      await ctx.reply("❌ You don't have any balance of this token to sell.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return null;
    }

    const currentBalanceBN = BigInt(holding.balance);
    if (currentBalanceBN === 0n) {
      await ctx.reply("❌ You don't have any balance of this token to sell.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return null;
    }

    return {
      holding,
      tokenData: holding.token,
    };
  } catch (error) {
    logger.error(`${logPrefix} Error checking token balance:`, error);
    await ctx.reply("❌ Error checking token balance. Please try again.", {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message?.message_id! },
    });
    return null;
  }
}

/**
 * Parse and validate percentage
 */
function parsePercentage(rawPct: string): number {
  const rawPctLower = rawPct.toLowerCase();

  if (rawPctLower === "half") {
    return 50;
  } else if (rawPctLower === "all") {
    return 100;
  } else {
    // Remove % symbol if present
    const cleanPct = rawPctLower.endsWith("%")
      ? rawPctLower.slice(0, -1)
      : rawPctLower;

    // Normalize in case comma is used
    const normalizedPct = normalizeAmount(cleanPct);
    const pctToSell = parseFloat(normalizedPct);

    if (isNaN(pctToSell) || pctToSell <= 0 || pctToSell > 100) {
      throw new Error("Invalid percentage, must be 1-100 (or half/all)");
    }

    return pctToSell;
  }
}

/**
 * Execute the sell transaction
 */
async function executeSellCommand(
  ctx: GlobalSceneContext,
  parsed: { percentage: string; token: string },
  wallet: any,
  tokenInfo: { tokenAddress: Address; symbol: string; decimals: number },
  holding: any,
  percentage: number,
  user: User
): Promise<void> {
  try {
    // Set slippage
    const slippagePercent = 50;

    // Calculate tokens to sell
    const currentBalanceBN = BigInt(holding.balance);
    const tokensToSell =
      (currentBalanceBN * BigInt(Math.floor(percentage))) / 100n;

    logger.info(
      `${logPrefix} Tokens to sell: ${formatEther(tokensToSell)} ${
        holding.token.symbol
      }`
    );

    // Find best DEX
    const feeTiers = [100, 500, 3000, 10000];
    const { best } = await getBestDexForSellTokenToEth({
      publicClient: publicClientQuickNode,
      tokenIn: tokenInfo.tokenAddress,
      feeTiers,
      amountTokenIn: tokensToSell,
    });

    if (!best) {
      throw new Error(
        "No liquidity found on UniswapV2, V3, Aerodrome, Zora or Apestore Pools"
      );
    }

    // Estimate ETH value we'll receive (for gas adjustment)
    let estimatedEthValue = 0n;
    try {
      if (best.amountOut) {
        estimatedEthValue = BigInt(best.amountOut);
        logger.info(
          `${logPrefix} Estimated ETH return: ${formatEther(
            estimatedEthValue
          )} ETH`
        );
      }
    } catch (err) {
      logger.warn(`${logPrefix} Failed to parse estimated ETH value:`, err);
    }

    const bestDex = best.dexName;
    logger.info(
      `${logPrefix} Best DEX: ${bestDex}, feeTier: ${best.feeTier || "N/A"}`
    );

    // Calculate fees
    const feePercent = await calculateFinalFee(
      ctx,
      tokenInfo.tokenAddress,
      user.id
    );
    logger.info(`${logPrefix} Final fee percent: ${feePercent}`);

    // Create transaction success callback for balance updates
    const onTransactionSuccess = createTextHandlerTransactionSuccessCallback(
      ctx,
      wallet,
      holding.token,
      user.id
    );

    // Execute sell based on best DEX
    let txHash: Hash;
    let waitReceipt: Promise<TransactionReceipt>;

    const wid = wallet.id;

    if (bestDex === "UniswapV2") {
      const result = await sellToken({
        ctx,
        userId: user.id,
        tokenAddress: tokenInfo.tokenAddress,
        tokenAmount: tokensToSell,
        slippagePercent,
        bestDex: best,
        feePercent,
        estimatedEthValue,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = SellHandlers.buildUniV2SellHandlers(
        ctx,
        holding.token,
        user.id,
        wid,
        txHash,
        false, // isGroup = false for individual sells
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
        swapType: "Sell",
        amountIn: formatEther(tokensToSell),
        symbol: holding.token.symbol,
        tokenAddress: tokenInfo.tokenAddress,
      });
    } else if (
      bestDex === "AerodromeVolatile" ||
      bestDex === "AerodromeStable"
    ) {
      const stable = bestDex === "AerodromeStable";
      const result = await sellTokenAerodrome({
        ctx,
        userId: user.id,
        tokenAddress: tokenInfo.tokenAddress,
        tokenAmount: tokensToSell,
        slippagePercent,
        bestDex: best,
        feePercent,
        stable,
        estimatedEthValue,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = SellHandlers.buildAeroSellHandlers(
        ctx,
        holding.token,
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
        swapType: "Sell",
        amountIn: formatEther(tokensToSell),
        symbol: holding.token.symbol,
        tokenAddress: tokenInfo.tokenAddress,
      });
    } else if (bestDex === "UniswapV3") {
      if (!best.feeTier) throw new Error("Missing fee tier");

      const result = await sellTokenV3({
        ctx,
        userId: user.id,
        tokenAddress: tokenInfo.tokenAddress,
        tokenAmount: tokensToSell,
        feePercent,
        bestDex: best,
        feeTier: best.feeTier,
        estimatedEthValue,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = SellHandlers.buildUniV3SellHandlers(
        ctx,
        holding.token,
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
        swapType: "Sell",
        amountIn: formatEther(tokensToSell),
        symbol: holding.token.symbol,
        tokenAddress: tokenInfo.tokenAddress,
      });
    } else if (bestDex === "ZoraMultiHop") {
      const result = await sellTokenZoraMultiHop({
        ctx,
        userId: user.id,
        tokenAddress: tokenInfo.tokenAddress,
        tokenAmount: tokensToSell,
        slippagePercent,
        feePercent,
        bestDex: best,
        estimatedEthValue,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = SellHandlers.buildZoraSellHandlers(
        ctx,
        holding.token,
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
        swapType: "Sell",
        amountIn: formatEther(tokensToSell),
        symbol: holding.token.symbol,
        tokenAddress: tokenInfo.tokenAddress,
      });
    } else if (bestDex === "ApeStore") {
      const result = await sellTokenVIVIApeStore({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress: tokenInfo.tokenAddress,
        tokenAmount: tokensToSell,
        slippagePercent,
        feePercent,
        bestDex: best,
        estimatedEthValue,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = SellHandlers.buildApeStoreSellHandlers(
        ctx,
        holding.token,
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
        swapType: "Sell",
        amountIn: formatEther(tokensToSell),
        symbol: holding.token.symbol,
        tokenAddress: tokenInfo.tokenAddress,
      });
    } else if (bestDex === "VirtualToken") {
      const result = await sellTokenVirtualToken({
        ctx,
        userId: user.id,
        walletId: wid,
        tokenAddress: tokenInfo.tokenAddress,
        tokenAmount: tokensToSell,
        slippagePercent,
        feePercent,
        bestDex: best,
        estimatedEthValue,
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = SellHandlers.buildVirtualTokenSellHandlers(
        ctx,
        holding.token,
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
        swapType: "Sell",
        amountIn: formatEther(tokensToSell),
        symbol: holding.token.symbol,
        tokenAddress: tokenInfo.tokenAddress,
      });
    } else {
      throw new Error("Unsupported DEX");
    }

    logger.info(`${logPrefix} Sell completed for ${user.id}`);
  } catch (error) {
    logger.error(`${logPrefix} Sell execution error:`, error);
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
 * Sell text handler - handles individual sell commands
 * Handles formats like:
 * - sell 50 BOBR
 * - sell all bife
 * - sell half baby sato
 * - sell 25% of USDC
 */
export const sellTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch
): Promise<boolean> => {
  try {
    logger.debug(
      `${logPrefix} Processing sell command with params:`,
      match.params
    );

    const tgUsername = ctx.from?.username;
    if (!tgUsername) {
      await ctx.reply(GENERIC_ERRORS.USERNAME_NOT_SET, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }
    const user = await ctx.services.userService.getUserByTgUsername(tgUsername);
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
    const parsed = parseSellCommand(commandText);

    if (!parsed) {
      await ctx.reply(
        "❌ Invalid sell format. Examples:\n" +
          "• sell 50 BOBR\n" +
          "• sell all bife\n" +
          "• sell half baby sato\n" +
          "• sell 25% of USDC",
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
      await ctx.reply(GENERIC_ERRORS.NO_WALLETS_FOUND, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    const wallet = userWithWallet.wallets[0];

    // Parse and validate percentage
    let percentage: number;
    try {
      percentage = parsePercentage(parsed.percentage);
      logger.info(`${logPrefix} Sell percentage: ${percentage}%`);
    } catch (error) {
      await ctx.reply(
        "❌ Invalid percentage. Please use a number between 1-100, 'half', or 'all'.",
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

    // Validate user has sufficient token balance
    const balanceCheck = await validateTokenBalance(
      ctx,
      tokenInfo.tokenAddress,
      wallet,
      user
    );
    if (!balanceCheck) {
      return true; // Error message already sent
    }

    const { holding, tokenData } = balanceCheck;

    // Update token info with actual data from holding
    tokenInfo.symbol = tokenData.symbol;
    tokenInfo.decimals = tokenData.decimals;

    // Execute the sell transaction
    await executeSellCommand(
      ctx,
      parsed,
      wallet,
      tokenInfo,
      holding,
      percentage,
      user
    );

    return true; // Successfully handled
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    await ctx.reply(
      `❌ Sell failed: ${
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
