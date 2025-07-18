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
  BuyAmountValidator,
  CONNECTOR_WORDS,
  MULTI_WORD_ALIASES,
  TOKEN_ALIASES,
  normalizeAmount,
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
} from "../../blockchain/services/swap";
import { findOrCreateToken } from "../../blockchain/services/token";
import { BuyHandlers } from "../scenes/trade/BuyHandlers";
import { replyTxNotificationsWithLinks } from "../../blockchain/services/swap/txNotifications";
import { calculateFinalFee } from "../../utils/feeDiscounts";
import { Token, User } from "@prisma/client";
import { getTokenBalance, getWalletBalance } from "@blockchain";

const logPrefix = "[buyTextHandler]";

interface ParsedBuyCommand {
  amount: string;
  token: string;
  tokenAddress?: Address;
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
        `[buyTextHandler] Executing transaction success callback for user ${userId}`
      );

      // Step 1: Update ETH balance for the selected wallet
      const newEthBalanceBN = await getWalletBalance(wallet.address as Address);
      await ctx.services.walletService.updateWalletBalance(
        wallet.id,
        newEthBalanceBN
      );
      logger.info(
        `[buyTextHandler] Updated ETH balance for wallet ${wallet.id}: ${newEthBalanceBN}`
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
        `[buyTextHandler] Updated token balance for wallet ${wallet.id}, token ${tokenData.symbol}: ${tokenBalanceBN}`
      );

      // Step 3: Clear PnL cache for the user
      await ctx.services.pnlCacheService.clearUserPnlCache(userId);
      logger.info(`[buyTextHandler] Cleared PnL cache for user ${userId}`);

      logger.info(
        `[buyTextHandler] Transaction success callback completed for user ${userId}`
      );
    } catch (error) {
      logger.error(
        `[buyTextHandler] Error in transaction success callback:`,
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
  user: User
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
      });
      txHash = result.txHash;
      waitReceipt = result.waitReceipt;

      const handlers = BuyHandlers.buildApeStoreBuyHandlers(
        ctx,
        { symbol: tokenInfo.symbol, decimals: tokenInfo.decimals } as any,
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
  match: TextMatch
): Promise<boolean> => {
  try {
    logger.debug(
      `${logPrefix} Processing buy command with params:`,
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
    await executeBuyCommand(ctx, parsed, wallet, tokenInfo, amountEth, user);

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
