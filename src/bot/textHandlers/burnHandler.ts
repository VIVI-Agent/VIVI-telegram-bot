// src/bot/handlers/groupSwap/groupBurnHandler.ts
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { TextHandler, TextMatch } from "./types";
import { Address, formatUnits, parseUnits } from "viem";
import { decryptPrivateKey, getWalletBalance } from "@services";
import { transferERC20, getTokenBalance } from "@blockchain";
import { sleep, normalizeAmount, generateTradeLink } from "@utils";

const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// Token aliases configuration - same as sendHandler
const TOKEN_ALIASES: Record<string, Address> = {
  bife: "0xD769d56f479E9E72a77bB1523e866A33098Feec5" as Address,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  // Add more aliases as needed
};

// Multi-word token aliases - same as sendHandler
const MULTI_WORD_ALIASES: Record<string, Address> = {
  "baby sato": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address, // Replace with actual address
  "pepe coin": "0x1234567890123456789012345678901234567890" as Address, // Example
};

// Connector words to ignore in parsing
const CONNECTOR_WORDS = [
  "of",
  "from",
  "for",
  "at",
  "into",
  "and",
  "tokens",
  "token",
  "coins",
  "coin",
];

interface ParsedBurnCommand {
  amount: string;
  token: string;
  tokenAddress?: Address;
}

/**
 * Generate clickeable token link for buy mode
 */
function generateClickeableToken(
  tokenSymbol: string,
  tokenAddress?: Address
): string {
  try {
    // For tokens without address, return plain text
    if (
      !tokenAddress ||
      tokenAddress === "0x0000000000000000000000000000000000000000"
    ) {
      return tokenSymbol.toUpperCase();
    }

    const buyLink = generateTradeLink({
      tokenAddress,
      mode: "buy",
    });
    return `<a href="${buyLink}">${tokenSymbol.toUpperCase()}</a>`;
  } catch (error) {
    // Fallback to plain text if link generation fails
    logger.warn(`Failed to generate trade link for ${tokenSymbol}:`, error);
    return tokenSymbol.toUpperCase();
  }
}

/**
 * Burn text handler - adapted from sendHandler pattern
 * Handles burn commands with multiple formats:
 * - burn 100 BOBR
 * - burn all of USDC
 * - burn half bife
 * - burn 50 baby sato
 */
export const burnTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch
): Promise<boolean> => {
  const logPrefix = "[burnTextHandler]";

  try {
    logger.debug(
      `${logPrefix} Processing burn command with params:`,
      match.params
    );

    // Parse the command from the full match
    const commandText = match.params.fullMatch as string;
    const parsed = parseBurnCommand(commandText);

    if (!parsed) {
      await ctx.reply(
        "❌ Invalid burn format:\n" +
          "• burn 100 (all, half, 100) Token (Symbol or CA)\n" +
          {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message?.message_id! },
          }
      );
      return true;
    }

    logger.info(`${logPrefix} Parsed command:`, parsed);

    // Check if trying to burn ETH
    if (parsed.token.toLowerCase() === "eth") {
      await ctx.reply("❌ Don't burn your ETH kiddo! 🔥⛽", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // Check if user has wallet
    if (!ctx.walletCreated) {
      await ctx.reply(
        "❌ You need to create a wallet first. Use /start to get started.",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    // Get user's selected wallet with holdings
    const userWithWallet =
      await ctx.services.userService.getUserWithSelectedWalletAndHoldingsByUserId(
        ctx.user.id
      );
    if (!userWithWallet?.wallets?.[0]) {
      await ctx.reply("❌ No wallet found. Please create a wallet first.", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    const senderWallet = userWithWallet.wallets[0];

    // Check ETH balance for gas
    const ethBalBN = await getWalletBalance(senderWallet.address as Address);
    if (ethBalBN === 0n) {
      await ctx.reply("❌ You need ETH for gas fees to burn tokens! ⛽", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // Resolve token symbol/address to actual token info
    const resolvedToken = await resolveTokenInfo(ctx, parsed, senderWallet);
    if (!resolvedToken) {
      return true; // Error message already sent
    }

    // Update parsed command with resolved token info
    parsed.tokenAddress = resolvedToken.tokenAddress;
    parsed.token = resolvedToken.symbol;

    // Validate user has sufficient balance
    const balanceCheck = await validateTokenBalance(
      ctx,
      parsed,
      senderWallet,
      resolvedToken
    );
    if (!balanceCheck) {
      return true; // Error message already sent
    }

    // Execute the burn (no separate confirmation needed)
    await executeBurnCommand(ctx, parsed, senderWallet, resolvedToken);

    return true; // Successfully handled
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    // For burn errors, executeBurnCommand already handled the message editing
    // So we just log and return true to indicate we handled it
    if (error instanceof Error && error.message.includes("burn")) {
      return true;
    }

    // Generic error for other cases (parsing, validation, etc.)
    await ctx.reply(
      "❌ Sorry, there was an error processing your burn command. Please try again.",
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      }
    );

    return true; // We handled it (even if with error)
  }
};

/**
 * Parse burn command text into structured data
 */
function parseBurnCommand(commandText: string): ParsedBurnCommand | null {
  const logPrefix = "[parseBurnCommand]";

  // Remove "burn" from the beginning and trim
  const cleanText = commandText.replace(/^burn\s+/i, "").trim();

  logger.debug(`${logPrefix} Parsing: "${cleanText}"`);

  // Split by spaces and filter out empty strings
  const words = cleanText.split(/\s+/).filter((word) => word.length > 0);

  if (words.length < 2) {
    logger.warn(`${logPrefix} Not enough words: ${words.length}`);
    return null;
  }

  // First word should be the amount
  const amount = words[0];
  const amountLower = amount.toLowerCase();

  // Validate amount format (number, "all", or "half")
  if (
    amountLower !== "all" &&
    amountLower !== "half" &&
    !/^\d+(\.\d+)?$/.test(amount)
  ) {
    logger.warn(`${logPrefix} Invalid amount format: ${amount}`);
    return null;
  }

  // Find token by filtering out connector words
  const filteredWords = words
    .slice(1)
    .filter((word) => !CONNECTOR_WORDS.includes(word.toLowerCase()));

  if (filteredWords.length < 1) {
    logger.warn(`${logPrefix} No token found after filtering connector words`);
    return null;
  }

  // Try to detect multi-word tokens first
  let token: string;
  let tokenAddress: Address | undefined;

  // Check for multi-word tokens
  const multiWordFound = findMultiWordToken(filteredWords);
  if (multiWordFound) {
    token = multiWordFound.token;
    tokenAddress = multiWordFound.address;
  } else {
    // Single word token
    token = filteredWords[0];

    // Check if it's an alias
    const aliasAddress = TOKEN_ALIASES[token.toLowerCase()];
    if (aliasAddress) {
      tokenAddress = aliasAddress;
    }
  }

  logger.debug(
    `${logPrefix} Parsed - Amount: ${amount}, Token: ${token}, Address: ${tokenAddress}`
  );

  return {
    amount,
    token,
    tokenAddress,
  };
}

/**
 * Find multi-word tokens in the word array
 */
function findMultiWordToken(
  words: string[]
): { token: string; address: Address; wordCount: number } | null {
  // Check 2-word combinations first, then 3-word, etc.
  for (let wordCount = 3; wordCount >= 2; wordCount--) {
    if (words.length >= wordCount) {
      const tokenCandidate = words.slice(0, wordCount).join(" ").toLowerCase();
      const address = MULTI_WORD_ALIASES[tokenCandidate];
      if (address) {
        return {
          token: tokenCandidate,
          address,
          wordCount,
        };
      }
    }
  }
  return null;
}

/**
 * Resolve token symbol/address to actual token info using HoldingService
 */
async function resolveTokenInfo(
  ctx: GlobalSceneContext,
  parsed: ParsedBurnCommand,
  senderWallet: any
): Promise<{ tokenAddress: Address; symbol: string; decimals: number } | null> {
  const logPrefix = "[resolveTokenInfo]";

  try {
    // If we already have a token address from aliases, use it
    if (parsed.tokenAddress) {
      logger.debug(
        `${logPrefix} Using alias token address: ${parsed.tokenAddress}`
      );
      // Try to find it in user's holdings first
      const holding = ctx.services.holdingService.getHoldingBySymbolOrAddress(
        senderWallet,
        parsed.tokenAddress
      );
      if (holding?.token) {
        return {
          tokenAddress: parsed.tokenAddress,
          symbol: holding.token.symbol,
          decimals: holding.token.decimals,
        };
      }
      // If not in holdings, return with default decimals
      return {
        tokenAddress: parsed.tokenAddress,
        symbol: parsed.token,
        decimals: 18, // Default, will be validated later
      };
    }

    // Use HoldingService to find token in user's holdings
    const holding = ctx.services.holdingService.getHoldingBySymbolOrAddress(
      senderWallet,
      parsed.token
    );

    if (!holding) {
      await ctx.reply(
        `❌ Token "${parsed.token}" not found in your wallet. Please check the symbol and try again.`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return null;
    }

    logger.info(
      `${logPrefix} Resolved token ${parsed.token} to address ${holding.token.address}`
    );

    return {
      tokenAddress: holding.token.address as Address,
      symbol: holding.token.symbol,
      decimals: holding.token.decimals || 18,
    };
  } catch (error) {
    logger.error(`${logPrefix} Error resolving token:`, error);
    await ctx.reply(
      `❌ Error resolving token "${parsed.token}". Please try again.`,
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      }
    );
    return null;
  }
}

/**
 * Validate user has sufficient token balance for the burn
 */
async function validateTokenBalance(
  ctx: GlobalSceneContext,
  parsed: ParsedBurnCommand,
  senderWallet: any,
  resolvedToken: { tokenAddress: Address; symbol: string; decimals: number }
): Promise<boolean> {
  const logPrefix = "[validateTokenBalance]";

  try {
    // Get user's holding for this token
    const holding = ctx.services.holdingService.getHoldingBySymbolOrAddress(
      senderWallet,
      resolvedToken.symbol
    );

    if (!holding) {
      await ctx.reply(
        `❌ You don't have any ${resolvedToken.symbol} tokens to burn.`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return false;
    }

    const currentBalanceBN = BigInt(holding.balance);

    if (currentBalanceBN === 0n) {
      await ctx.reply(
        `❌ You have zero ${resolvedToken.symbol} balance to burn.`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return false;
    }

    // Calculate amount to burn
    let amountBN: bigint;
    const amountLower = parsed.amount.toLowerCase();

    if (amountLower === "half") {
      amountBN = (currentBalanceBN * 50n) / 100n;
    } else if (amountLower === "all") {
      amountBN = currentBalanceBN;
    } else {
      const normalizedAmount = normalizeAmount(parsed.amount);
      if (isNaN(Number(normalizedAmount))) {
        await ctx.reply(`❌ Invalid burn amount: ${parsed.amount}`, {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        });
        return false;
      }

      amountBN = parseUnits(normalizedAmount, resolvedToken.decimals);
      if (amountBN > currentBalanceBN) {
        const currentBalance = formatUnits(
          currentBalanceBN,
          resolvedToken.decimals
        );
        await ctx.reply(
          `❌ Insufficient ${resolvedToken.symbol} balance!\n` +
            `💰 Your balance: ${currentBalance}\n` +
            `🔥 Trying to burn: ${normalizedAmount}`,
          {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message?.message_id! },
          }
        );
        return false;
      }
    }

    logger.info(
      `${logPrefix} Balance validation passed for ${formatUnits(
        amountBN,
        resolvedToken.decimals
      )} ${resolvedToken.symbol}`
    );

    return true;
  } catch (error) {
    logger.error(`${logPrefix} Error validating balance:`, error);
    await ctx.reply(
      `❌ Error checking your ${resolvedToken.symbol} balance. Please try again.`,
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      }
    );
    return false;
  }
}

/**
 * Execute the burn command
 */
async function executeBurnCommand(
  ctx: GlobalSceneContext,
  parsed: ParsedBurnCommand,
  senderWallet: any,
  resolvedToken: { tokenAddress: Address; symbol: string; decimals: number }
): Promise<void> {
  const logPrefix = "[executeBurnCommand]";

  try {
    // Get user's holding for this token
    const holding = ctx.services.holdingService.getHoldingBySymbolOrAddress(
      senderWallet,
      resolvedToken.symbol
    );

    if (!holding) {
      throw new Error("Token holding not found");
    }

    const currentBalanceBN = BigInt(holding.balance);

    // Calculate amount to burn
    let amountBN: bigint;
    const amountLower = parsed.amount.toLowerCase();

    if (amountLower === "half") {
      amountBN = (currentBalanceBN * 50n) / 100n;
    } else if (amountLower === "all") {
      amountBN = currentBalanceBN;
    } else {
      const normalizedAmount = normalizeAmount(parsed.amount);
      amountBN = parseUnits(normalizedAmount, resolvedToken.decimals);
    }

    const burnAmountFormatted = formatUnits(amountBN, resolvedToken.decimals);

    logger.info(
      `${logPrefix} Burning ${burnAmountFormatted} ${resolvedToken.symbol}`
    );

    // Create clickeable token link
    const tokenLink = generateClickeableToken(
      resolvedToken.symbol,
      resolvedToken.tokenAddress
    );

    // Send initial "submitting" message
    let message = `⏳ <b>Submitting Burn!</b>\n`;
    message += `💰 <b>Amount:</b> ${burnAmountFormatted} ${tokenLink}`;

    const initialMessage = await ctx.reply(message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: ctx.message?.message_id! },
    });

    // Get wallet with encrypted private key
    const walletRecord = await ctx.services.walletService.getWalletWithHoldings(
      senderWallet.id
    );

    if (!walletRecord) {
      throw new Error("Wallet configuration error");
    }

    const privateKey = decryptPrivateKey(walletRecord.encryptedPrivKey);

    // Execute burn transaction
    const tx = await transferERC20(
      privateKey,
      resolvedToken.tokenAddress,
      DEAD_ADDRESS as Address,
      amountBN,
      1
    );

    logger.info(`${logPrefix} TX submitted: ${tx.txHash}`);

    // Update message with transaction hash
    message = `📤 <b>Burn Submitted!</b>\n`;
    message += `💰 <b>Amount:</b> ${burnAmountFormatted} ${tokenLink}\n`;
    message += `🌐 <a href="https://basescan.org/tx/${tx.txHash}">View on BaseScan</a>`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      initialMessage.message_id,
      undefined,
      message,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }
    );

    // Wait for transaction receipt
    const receipt = await tx.waitReceipt;

    if (receipt.status !== "success") {
      // Update message with failure
      message = `❌ <b>Burn Failed!</b>\n`;
      message += `💰 <b>Amount:</b> ${burnAmountFormatted} ${tokenLink}\n`;
      message += `🌐 <a href="https://basescan.org/tx/${tx.txHash}">View on BaseScan</a>`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        initialMessage.message_id,
        undefined,
        message,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }
      );
      throw new Error("Burn transaction failed");
    }

    // Update message with success
    message = `✅ <b>Burn Successful!</b>\n`;
    message += `💰 <b>Amount:</b> ${burnAmountFormatted} ${tokenLink}\n`;
    message += `🌐 <a href="https://basescan.org/tx/${tx.txHash}">View on BaseScan</a>`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      initialMessage.message_id,
      undefined,
      message,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }
    );

    // Update balances in background
    setImmediate(async () => {
      try {
        await sleep(2000);
        logger.debug(`${logPrefix} Updating balances for ${tx.txHash}`);

        const [newEthBalance, newTokenBalance] = await Promise.all([
          getWalletBalance(walletRecord.address as Address),
          getTokenBalance(
            resolvedToken.tokenAddress,
            walletRecord.address as Address
          ),
        ]);

        await ctx.services.walletService.updateWalletBalance(
          walletRecord.id,
          newEthBalance
        );

        await ctx.services.holdingService.updateHoldingFromChain({
          userId: walletRecord.userId,
          tokenId: holding.token.id,
          walletId: walletRecord.id,
          newBalance: newTokenBalance,
        });

        logger.debug(`${logPrefix} Balance updates completed`);
      } catch (err) {
        logger.error(
          `${logPrefix} Background error: ${
            err instanceof Error ? err.stack : err
          }`
        );
      }
    });

    logger.info(`${logPrefix} Burn completed successfully`);
  } catch (error) {
    logger.error(`${logPrefix} Error executing burn:`, error);
    throw error; // Re-throw to be handled by caller
  }
}
