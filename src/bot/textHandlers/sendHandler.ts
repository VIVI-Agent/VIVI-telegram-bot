import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { TextHandler, TextMatch } from "./types";
import { Address } from "viem";
import {
  resolveBNSAddress,
  isBNSName,
  BNSError,
  BNSErrorType,
} from "../../blockchain/services/nameResolution/resolveBNSName";
import { getBankrEVMAddress } from "../../blockchain/services/nameResolution/bankr";
import { batchTransferService } from "../../blockchain/transactions/batchTransfer/batchTransferService";
import { ethBatchTransferService } from "../../blockchain/transactions/batchTransfer/ethBatchTransferService";
import { User, Wallet } from "@prisma/client";
import {
  decryptPrivateKey,
  getWalletBalance,
  createBaseWallet,
} from "@services";
import { getTokenBalance } from "@blockchain";
import { publicClientQuickNode } from "@client";
import {
  generateTradeLink,
  sleep,
  generateShareableTransferMessage,
} from "@utils";
import { GENERIC_ERRORS } from "@texts";

/**
 * Generate clickeable token link for buy mode
 */
function generateClickeableToken(
  tokenSymbol: string,
  tokenAddress?: Address,
  isEthTransfer?: boolean
): string {
  try {
    // For ETH transfers or tokens without address, return plain text
    if (
      isEthTransfer ||
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

// Token aliases configuration
const TOKEN_ALIASES: Record<string, Address> = {
  // Single word aliases that resolve to specific addresses
  bife: "0x1234567890123456789012345678901234567890" as Address, // Replace with actual BIFE address
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  // Note: ETH is handled specially as native ETH, not WETH
};

// Multi-word token aliases
const MULTI_WORD_ALIASES: Record<string, Address> = {
  "baby sato": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address, // Replace with actual address
  "pepe coin": "0x1234567890123456789012345678901234567890" as Address, // Example
};

// Connector words to ignore in parsing
const CONNECTOR_WORDS = [
  "of",
  "from",
  "to",
  "for",
  "->",
  "→",
  "at",
  "into",
  "and",
];

interface ParsedSendCommand {
  amount: string;
  token: string;
  tokenAddress?: Address;
  recipients: string[];
  isEthTransfer: boolean;
}

interface ValidatedRecipient {
  original: string;
  address: Address;
  userId?: number;
  displayName: string;
  type: "address" | "bns" | "username";
}

/**
 * Validates if a string is a valid Telegram username
 * Rules: a-z, 0-9, underscore only, minimum 5 characters
 */
function isValidTelegramUsername(username: string): boolean {
  // Remove @ if present
  const cleanUsername = username.replace(/^@/, "");

  // Check length (minimum 5 characters)
  if (cleanUsername.length < 5) {
    return false;
  }

  // Check only allowed characters: a-z, 0-9, underscore
  const validPattern = /^[a-zA-Z0-9_]+$/;
  return validPattern.test(cleanUsername);
}

/**
 * Send text handler - adapted for TextManager
 * Handles complex send commands with multiple formats:
 * - send 1 BOBR @username
 * - send 0.1 of ETH to alice.base.eth
 * - send 100 bife to @user1 @user2 bob.base.eth
 */
export const sendTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch
): Promise<boolean> => {
  const logPrefix = "[sendTextHandler]";

  try {
    logger.debug(
      `${logPrefix} Processing send command with params:`,
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
      });
      return true;
    }

    // Parse the command from the full match
    const commandText = match.params.fullMatch as string;
    const parsed = await parseSendCommand(commandText);

    if (!parsed) {
      await ctx.reply(
        "❌ Invalid send format. Examples:\n" +
          "• send 1 BOBR @username\n" +
          "• send 0.1 ETH to alice.base.eth\n" +
          "• send 100 tokens to @user1 @user2\n" +
          "• send 50 BOBR bx@vitalik (Twitter)\n" +
          "• send 25 BOBR bf@dwr (Farcaster)",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    logger.info(`${logPrefix} Parsed command:`, parsed);

    // Validate and resolve recipients
    const recipientResult = await validateAndResolveRecipients(
      ctx,
      parsed.recipients,
      user
    );

    const validatedRecipients = recipientResult.valid;
    const invalidRecipients = recipientResult.invalid;

    if (validatedRecipients.length === 0) {
      let errorMessage = "❌ No valid recipients found.";

      if (invalidRecipients.length > 0) {
        errorMessage += "\n\n❌ Invalid recipients:";
        invalidRecipients.forEach((invalid) => {
          errorMessage += `\n• ${invalid.original}: ${invalid.reason}`;
        });
      }

      await ctx.reply(errorMessage, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

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

    const senderWallet = userWithWallet.wallets[0];

    // Resolve token symbol/address to actual token info
    const resolvedToken = await resolveTokenInfo(ctx, parsed, senderWallet);
    if (!resolvedToken) {
      return true; // Error message already sent
    }

    // Update parsed command with resolved token address
    parsed.tokenAddress = resolvedToken.tokenAddress;
    parsed.token = resolvedToken.symbol;

    // Validate user has sufficient balance
    const balanceCheck = await validateTokenBalance(
      ctx,
      parsed,
      senderWallet,
      resolvedToken,
      validatedRecipients.length
    );
    if (!balanceCheck) {
      return true; // Error message already sent
    }

    // Execute the transfer (no separate confirmation needed)
    await executeSendCommand(
      ctx,
      parsed,
      validatedRecipients,
      senderWallet,
      resolvedToken.decimals,
      invalidRecipients
    );

    // Log invalid recipients if any
    if (invalidRecipients.length > 0) {
      logger.info(
        `${logPrefix} Transaction completed with ${
          invalidRecipients.length
        } invalid recipients: ${invalidRecipients
          .map((r) => r.original)
          .join(", ")}`
      );
    }

    return true; // Successfully handled
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    // Handle specific BNS errors (these happen before executeSendCommand)
    if (error && typeof error === "object" && "type" in error) {
      const bnsError = error as BNSError;
      await ctx.reply(`❌ ${bnsError.message}`, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // For transfer errors, executeSendCommand already handled the message editing
    // So we just log and return true to indicate we handled it
    if (error instanceof Error && error.message.includes("transfer")) {
      return true;
    }

    // Generic error for other cases (parsing, validation, etc.)
    await ctx.reply(
      "❌ Sorry, there was an error processing your send command. Please try again.",
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      }
    );

    return true; // We handled it (even if with error)
  }
};

/**
 * Parse send command text into structured data
 */
async function parseSendCommand(
  commandText: string
): Promise<ParsedSendCommand | null> {
  const logPrefix = "[parseSendCommand]";

  // Remove "send" from the beginning and trim
  const cleanText = commandText.replace(/^send\s+/i, "").trim();

  logger.debug(`${logPrefix} Parsing: "${cleanText}"`);

  // Split by spaces and filter out empty strings
  const words = cleanText.split(/\s+/).filter((word) => word.length > 0);

  if (words.length < 3) {
    logger.warn(`${logPrefix} Not enough words: ${words.length}`);
    return null;
  }

  // First word should be the amount
  const amount = words[0];
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    logger.warn(`${logPrefix} Invalid amount format: ${amount}`);
    return null;
  }

  // Find token and recipients by filtering out connector words
  const filteredWords = words
    .slice(1)
    .filter((word) => !CONNECTOR_WORDS.includes(word.toLowerCase()));

  if (filteredWords.length < 2) {
    logger.warn(
      `${logPrefix} Not enough filtered words: ${filteredWords.length}`
    );
    return null;
  }

  // Try to detect multi-word tokens first
  let token: string;
  let tokenAddress: Address | undefined;
  let remainingWords: string[];

  // Check for multi-word tokens
  const multiWordFound = findMultiWordToken(filteredWords);
  if (multiWordFound) {
    token = multiWordFound.token;
    tokenAddress = multiWordFound.address;
    remainingWords = filteredWords.slice(multiWordFound.wordCount);
  } else {
    // Single word token
    token = filteredWords[0];
    remainingWords = filteredWords.slice(1);

    // Check if it's an alias
    const aliasAddress = TOKEN_ALIASES[token.toLowerCase()];
    if (aliasAddress) {
      tokenAddress = aliasAddress;
    }
  }

  // Remaining words are recipients
  const recipients = remainingWords;

  if (recipients.length === 0) {
    logger.warn(`${logPrefix} No recipients found`);
    return null;
  }

  const isEthTransfer = token.toLowerCase() === "eth";

  logger.debug(
    `${logPrefix} Parsed - Amount: ${amount}, Token: ${token}, Recipients: ${recipients.join(
      ", "
    )}`
  );

  return {
    amount,
    token,
    tokenAddress,
    recipients,
    isEthTransfer,
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
 * Validate and resolve recipients to addresses
 */
async function validateAndResolveRecipients(
  ctx: GlobalSceneContext,
  recipients: string[],
  user: User
): Promise<{
  valid: ValidatedRecipient[];
  invalid: { original: string; reason: string }[];
}> {
  const logPrefix = "[validateAndResolveRecipients]";
  const validated: ValidatedRecipient[] = [];
  const invalid: { original: string; reason: string }[] = [];

  for (const recipient of recipients) {
    try {
      logger.debug(`${logPrefix} Validating recipient: ${recipient}`);

      // Check if it's a BNS name
      if (isBNSName(recipient)) {
        try {
          const address = await resolveBNSAddress(recipient);
          if (address) {
            validated.push({
              original: recipient,
              address,
              displayName: recipient,
              type: "bns",
            });
            continue;
          } else {
            invalid.push({
              original: recipient,
              reason: "BNS name could not be resolved",
            });
            continue;
          }
        } catch (error) {
          invalid.push({
            original: recipient,
            reason: "BNS name resolution failed",
          });
          continue;
        }
      }

      // Check if it's an Ethereum address
      if (/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
        validated.push({
          original: recipient,
          address: recipient as Address,
          displayName: `<code>${recipient}</code>`,
          type: "address",
        });
        continue;
      }

      // Check if it's a Bankr tag (bx@username for Twitter, bf@username for Farcaster)
      if (recipient.startsWith("bx@") || recipient.startsWith("bf@")) {
        const platform = recipient.startsWith("bx@") ? "twitter" : "farcaster";
        const username = recipient.substring(3); // Remove "bx@" or "bf@"

        logger.debug(
          `${logPrefix} Resolving Bankr ${platform} username: ${username}`
        );

        try {
          const address = await getBankrEVMAddress(ctx, username, platform);
          if (address) {
            validated.push({
              original: recipient,
              address: address as Address,
              displayName:
                platform === "twitter"
                  ? `Bankr X <a href="https://x.com/${username}">@${username}</a>`
                  : `Bankr Farcaster <a href="https://farcaster.xyz/${username}">${username}</a>`,
              type: "bns", // Using bns type for Bankr addresses
            });
            continue;
          } else {
            invalid.push({
              original: recipient,
              reason: `Bankr ${platform} username not found`,
            });
            continue;
          }
        } catch (error) {
          logger.error(
            `${logPrefix} Error resolving Bankr ${platform} username ${username}:`,
            error
          );
          invalid.push({
            original: recipient,
            reason: `Bankr ${platform} resolution failed`,
          });
          continue;
        }
      }

      // Check if it's a Telegram username (MUST start with @)
      if (recipient.startsWith("@")) {
        const username = recipient.replace(/^@/, "");

        // Validate username format first
        if (!isValidTelegramUsername(username)) {
          logger.warn(
            `${logPrefix} Invalid Telegram username format: ${username}`
          );
          invalid.push({
            original: recipient,
            reason: "Invalid Telegram username format",
          });
          continue;
        }

        // Look up user in database
        let targetUser = await ctx.services.userService.getUserByUsername(
          username
        );

        if (targetUser) {
          // Get user with wallets
          const userWithWallets =
            await ctx.services.userService.getUserWithSelectedWalletAndHoldingsByUserId(
              targetUser.id
            );
          if (userWithWallets?.wallets?.[0]) {
            validated.push({
              original: recipient,
              address: userWithWallets.wallets[0].address as Address,
              userId: targetUser.id,
              displayName: `@${username}`,
              type: "username",
            });
            continue;
          }
        } else {
          // User doesn't exist - create new user
          try {
            logger.info(
              `${logPrefix} Creating new user for @${username} with referral from ${user.id}`
            );

            // Get sender's username to set as referrer
            const referralTgUsername = user.tgUsername || undefined;

            const newUser =
              await ctx.services.userService.createUserWithSettings({
                tgUsername: username,
                referralTgUsername: referralTgUsername, // Set sender as referrer
              });

            const { address, encryptedPrivKey } = await createBaseWallet();
            await ctx.services.walletService.createUserWallet(
              newUser.id,
              address,
              encryptedPrivKey,
              true
            );

            logger.info(
              `${logPrefix} Created user ${newUser.id} with wallet ${address}${
                referralTgUsername ? ` referred by @${referralTgUsername}` : ""
              }`
            );

            validated.push({
              original: recipient,
              address: address as Address,
              userId: newUser.id,
              displayName: `@${username}`,
              type: "username",
            });
            continue;
          } catch (error) {
            logger.error(
              `${logPrefix} Error creating user for @${username}:`,
              error
            );
            invalid.push({
              original: recipient,
              reason: "Failed to create new user account",
            });
            continue;
          }
        }
      } else {
        // Not a valid recipient format
        invalid.push({
          original: recipient,
          reason:
            "Invalid recipient format (must be address, BNS name, @username, bx@username, or bf@username)",
        });
      }

      logger.warn(`${logPrefix} Could not resolve recipient: ${recipient}`);
    } catch (error) {
      logger.error(
        `${logPrefix} Error validating recipient ${recipient}:`,
        error
      );
      invalid.push({
        original: recipient,
        reason: "Validation error",
      });
    }
  }

  return { valid: validated, invalid };
}

/**
 * Validate user has sufficient ETH balance for native ETH transfer
 */
async function validateETHBalance(
  ctx: GlobalSceneContext,
  parsed: ParsedSendCommand,
  senderWallet: Wallet,
  recipientCount: number
): Promise<boolean> {
  const logPrefix = "[validateETHBalance]";

  try {
    // Get ETH balance directly from chain
    const walletAddress = senderWallet.address as Address;
    const ethBalance = await publicClientQuickNode.getBalance({
      address: walletAddress,
    });

    // Calculate total amount needed (amount per recipient * number of recipients)
    const amountPerRecipient = BigInt(
      parseFloat(parsed.amount) * Math.pow(10, 18) // ETH has 18 decimals
    );
    const totalAmountNeeded = amountPerRecipient * BigInt(recipientCount);

    logger.debug(
      `${logPrefix} User ETH balance: ${ethBalance}, Total needed: ${totalAmountNeeded}`
    );

    if (ethBalance < totalAmountNeeded) {
      const readableBalance = (Number(ethBalance) / Math.pow(10, 18)).toFixed(
        6
      );
      const readableNeeded = (
        Number(totalAmountNeeded) / Math.pow(10, 18)
      ).toFixed(6);

      await ctx.reply(
        `❌ Insufficient ETH balance!\n` +
          `💰 Your balance: ${readableBalance} ETH\n` +
          `💸 Amount needed: ${readableNeeded} ETH\n` +
          `📊 Recipients: ${recipientCount}`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return false;
    }

    logger.info(`${logPrefix} ETH balance validation passed`);
    return true;
  } catch (error) {
    logger.error(`${logPrefix} Error validating ETH balance:`, error);
    await ctx.reply(`❌ Error checking your ETH balance. Please try again.`, {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message?.message_id! },
    });
    return false;
  }
}

/**
 * Validate user has sufficient token balance for the transfer
 */
async function validateTokenBalance(
  ctx: GlobalSceneContext,
  parsed: ParsedSendCommand,
  senderWallet: any,
  resolvedToken: { tokenAddress: Address; symbol: string; decimals: number },
  recipientCount: number
): Promise<boolean> {
  const logPrefix = "[validateTokenBalance]";

  try {
    // For native ETH transfers, use special ETH validation
    if (parsed.isEthTransfer) {
      return await validateETHBalance(
        ctx,
        parsed,
        senderWallet,
        recipientCount
      );
    }

    // Get the holding for this token
    const holding = ctx.services.holdingService.getHoldingBySymbolOrAddress(
      senderWallet,
      parsed.token
    );

    if (!holding) {
      await ctx.reply(`❌ You don't have any ${parsed.token} in your wallet.`, {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return false;
    }

    // Calculate total amount needed (amount per recipient * number of recipients)
    const amountPerRecipient = BigInt(
      parseFloat(parsed.amount) * Math.pow(10, resolvedToken.decimals)
    );
    const totalAmountNeeded = amountPerRecipient * BigInt(recipientCount);
    const userBalance = BigInt(holding.balance);

    logger.debug(
      `${logPrefix} User balance: ${userBalance}, Total needed: ${totalAmountNeeded}`
    );

    if (userBalance < totalAmountNeeded) {
      const readableBalance = (
        Number(userBalance) / Math.pow(10, resolvedToken.decimals)
      ).toFixed(6);
      const readableNeeded = (
        Number(totalAmountNeeded) / Math.pow(10, resolvedToken.decimals)
      ).toFixed(6);

      await ctx.reply(
        `❌ Insufficient balance!\n\n` +
          `💰 Your balance: ${readableBalance} ${parsed.token}\n` +
          `💸 Amount needed: ${readableNeeded} ${parsed.token}\n` +
          `📊 Recipients: ${recipientCount}`,
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return false;
    }

    logger.info(`${logPrefix} Balance validation passed for ${parsed.token}`);
    return true;
  } catch (error) {
    logger.error(`${logPrefix} Error validating balance:`, error);
    await ctx.reply(`❌ Error checking your balance. Please try again.`, {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message?.message_id! },
    });
    return false;
  }
}

/**
 * Resolve token symbol or address to actual token info using HoldingService
 */
async function resolveTokenInfo(
  ctx: GlobalSceneContext,
  parsed: ParsedSendCommand,
  senderWallet: any
): Promise<{ tokenAddress: Address; symbol: string; decimals: number } | null> {
  const logPrefix = "[resolveTokenInfo]";

  try {
    // If we already have a token address from aliases, use it
    if (parsed.tokenAddress) {
      logger.debug(
        `${logPrefix} Using alias token address: ${parsed.tokenAddress}`
      );
      return {
        tokenAddress: parsed.tokenAddress,
        symbol: parsed.token,
        decimals: 18, // Default, could be improved
      };
    }

    // For ETH transfers, handle as native ETH (not WETH)
    if (parsed.isEthTransfer) {
      logger.debug(`${logPrefix} Native ETH transfer detected`);
      return {
        tokenAddress: "0x0000000000000000000000000000000000000000" as Address, // Special address for native ETH
        symbol: "ETH",
        decimals: 18,
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
 * Execute the send command using batch transfer service
 */
async function executeSendCommand(
  ctx: GlobalSceneContext,
  parsed: ParsedSendCommand,
  recipients: ValidatedRecipient[],
  senderWallet: Wallet,
  tokenDecimals: number = 18,
  invalidRecipients: { original: string; reason: string }[] = []
): Promise<void> {
  const logPrefix = "[executeSendCommand]";
  let statusMessage: any;

  try {
    logger.info(
      `${logPrefix} Executing send: ${parsed.amount} ${parsed.token} to ${recipients.length} recipients`
    );

    // Send initial status message
    let message = `⏳ <b>Submitting Transfer!</b>\n`;
    message += `💰 <b>Amount:</b> ${parsed.amount} ${generateClickeableToken(
      parsed.token,
      parsed.tokenAddress,
      parsed.isEthTransfer
    )}\n`;
    message += `👥 <b>Recipients:</b> ${recipients
      .map((r) => r.displayName)
      .join(", ")}`;

    // Add invalid recipients if any
    if (invalidRecipients.length > 0) {
      message += `\n👥 <b>Invalid:</b> ${invalidRecipients
        .map((inv) => inv.original)
        .join(", ")}`;
    }

    statusMessage = await ctx.reply(message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: ctx.message?.message_id! },
    });

    // Calculate amount with correct decimals
    const amountWithDecimals = BigInt(
      parseFloat(parsed.amount) * Math.pow(10, tokenDecimals)
    );

    let result;

    // Use different services based on whether it's ETH or token transfer
    if (parsed.isEthTransfer) {
      // Use ETH batch transfer service for native ETH
      result = await ethBatchTransferService({
        ctx,
        privateKey: decryptPrivateKey(senderWallet.encryptedPrivKey),
        recipients: recipients.map((r) => ({
          address: r.address,
          userId: r.userId,
          displayName: r.displayName,
          type: r.type,
        })),
        amountEach: amountWithDecimals,
        senderWallet,
      });
    } else {
      // Use ERC20 batch transfer service for tokens
      result = await batchTransferService({
        ctx,
        privateKey: decryptPrivateKey(senderWallet.encryptedPrivKey),
        tokenAddress: parsed.tokenAddress!,
        recipients: recipients.map((r) => ({
          address: r.address,
          userId: r.userId,
          displayName: r.displayName,
          type: r.type,
        })),
        amountEach: amountWithDecimals,
        senderWallet,
      });
    }

    // Update message with transaction submitted
    message = `📤 <b>Transaction Submitted!</b>\n`;
    message += `💰 <b>Amount:</b> ${parsed.amount} ${generateClickeableToken(
      parsed.token,
      parsed.tokenAddress,
      parsed.isEthTransfer
    )}\n`;
    message += `👥 <b>Recipients:</b> ${recipients
      .map((r) => r.displayName)
      .join(", ")}`;

    // Add invalid recipients if any
    if (invalidRecipients.length > 0) {
      message += `\n❌ <b>Invalid:</b> ${invalidRecipients
        .map((inv) => inv.original)
        .join(", ")}`;
    }

    message += `\n🌐 <a href="https://basescan.org/tx/${result.txHash}">View on BaseScan</a>`;

    await ctx.telegram.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      undefined,
      message,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }
    );

    // Wait for confirmation
    try {
      const receipt = await result.waitReceipt;

      if (receipt.status === "success") {
        // Final success message
        message = `✅ <b>Transfer Successful!</b>\n`;
        message += `💰 <b>Amount:</b> ${
          parsed.amount
        } ${generateClickeableToken(
          parsed.token,
          parsed.tokenAddress,
          parsed.isEthTransfer
        )}\n`;
        message += `👥 <b>Recipients:</b> ${recipients
          .map((r) => r.displayName)
          .join(", ")}\n`;

        // Add invalid recipients if any
        if (invalidRecipients.length > 0) {
          message += `❌ <b>Invalid:</b> ${invalidRecipients
            .map((inv) => inv.original)
            .join(", ")}\n`;
        }

        message += `🌐 <a href="https://basescan.org/tx/${result.txHash}">View on BaseScan</a>`;

        await ctx.telegram.editMessageText(
          statusMessage.chat.id,
          statusMessage.message_id,
          undefined,
          message,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup:
              ctx.chat?.type === "private"
                ? {
                    inline_keyboard: [
                      [
                        {
                          text: "⏩ Let 'Em Know",
                          url: `https://t.me/share/url?url=${encodeURIComponent(
                            generateShareableTransferMessage(
                              parsed.amount,
                              parsed.token,
                              result.txHash,
                              ctx.from?.username
                            )
                          )}`,
                        },
                      ],
                    ],
                  }
                : undefined,
          }
        );

        logger.info(
          `${logPrefix} Transfer completed successfully: ${result.txHash}`
        );

        // Update balances in background
        setImmediate(async () => {
          try {
            await sleep(2000);
            logger.debug(
              `${logPrefix} Starting background balance updates for ${result.txHash}`
            );

            // Get wallet record for sender
            const walletRecord =
              await ctx.services.walletService.getWalletWithHoldings(
                senderWallet.id
              );
            if (!walletRecord) {
              logger.error(
                `${logPrefix} Sender wallet not found: ${senderWallet.id}`
              );
              return;
            }

            if (parsed.isEthTransfer) {
              // ETH transfer - update ETH balances
              const [newSenderEthBalance] = await Promise.all([
                getWalletBalance(senderWallet.address as Address),
              ]);

              await ctx.services.walletService.updateWalletBalance(
                senderWallet.id,
                newSenderEthBalance
              );

              logger.debug(`${logPrefix} Updated sender ETH balance`);

              // Update recipient balances for Telegram users
              for (const recipient of recipients) {
                if (recipient.userId && recipient.type === "username") {
                  try {
                    const recipientWallet =
                      await ctx.services.walletService.getSelectedWallet(
                        recipient.userId
                      );
                    if (recipientWallet) {
                      const newRecipientEthBalance = await getWalletBalance(
                        recipient.address
                      );
                      await ctx.services.walletService.updateWalletBalance(
                        recipientWallet.id,
                        newRecipientEthBalance
                      );
                      logger.debug(
                        `${logPrefix} Updated recipient ETH balance for user ${recipient.userId}`
                      );
                    }
                  } catch (err) {
                    logger.error(
                      `${logPrefix} Error updating recipient ETH balance for user ${recipient.userId}:`,
                      err
                    );
                  }
                }
              }
            } else {
              // Token transfer - update both ETH and token balances
              const tokenInfo =
                await ctx.services.holdingService.getHoldingBySymbolOrAddress(
                  walletRecord,
                  parsed.token
                );

              if (!tokenInfo?.token) {
                logger.error(
                  `${logPrefix} Token info not found for ${parsed.token}`
                );
                return;
              }

              const [newSenderEthBalance, newSenderTokenBalance] =
                await Promise.all([
                  getWalletBalance(walletRecord.address as Address),
                  getTokenBalance(
                    tokenInfo.token.address as Address,
                    walletRecord.address as Address
                  ),
                ]);

              // Update sender balances
              await ctx.services.walletService.updateWalletBalance(
                walletRecord.id,
                newSenderEthBalance
              );

              await ctx.services.holdingService.updateHoldingFromChain({
                userId: walletRecord.userId,
                tokenId: tokenInfo.token.id,
                walletId: walletRecord.id,
                newBalance: newSenderTokenBalance,
              });

              logger.debug(
                `${logPrefix} Updated sender token and ETH balances`
              );

              // Update recipient balances for Telegram users
              for (const recipient of recipients) {
                if (recipient.userId && recipient.type === "username") {
                  try {
                    const recipientWallet =
                      await ctx.services.walletService.getSelectedWallet(
                        recipient.userId
                      );
                    if (recipientWallet) {
                      const [newRecipientEthBalance, newRecipientTokenBalance] =
                        await Promise.all([
                          getWalletBalance(recipient.address),
                          getTokenBalance(
                            tokenInfo.token.address as Address,
                            recipient.address
                          ),
                        ]);

                      await ctx.services.walletService.updateWalletBalance(
                        recipientWallet.id,
                        newRecipientEthBalance
                      );

                      await ctx.services.holdingService.updateHoldingFromChain({
                        userId: recipient.userId,
                        tokenId: tokenInfo.token.id,
                        walletId: recipientWallet.id,
                        newBalance: newRecipientTokenBalance,
                      });

                      logger.debug(
                        `${logPrefix} Updated recipient token and ETH balances for user ${recipient.userId}`
                      );
                    }
                  } catch (err) {
                    logger.error(
                      `${logPrefix} Error updating recipient balances for user ${recipient.userId}:`,
                      err
                    );
                  }
                }
              }
            }

            logger.debug(
              `${logPrefix} Balance updates completed for ${result.txHash}`
            );
          } catch (err) {
            logger.error(
              `${logPrefix} Background balance update error: ${
                err instanceof Error ? err.stack : err
              }`
            );
          }
        });
      } else {
        // Transaction failed
        message = `❌ <b>Transfer Failed!</b>\n`;
        message += `💰 <b>Amount:</b> ${
          parsed.amount
        } ${generateClickeableToken(
          parsed.token,
          parsed.tokenAddress,
          parsed.isEthTransfer
        )}\n`;
        message += `👥 <b>Recipients:</b> ${recipients
          .map((r) => r.displayName)
          .join(", ")}\n`;

        // Add invalid recipients if any
        if (invalidRecipients.length > 0) {
          message += `❌ <b>Invalid:</b> ${invalidRecipients
            .map((inv) => inv.original)
            .join(", ")}\n`;
        }

        message += `🌐 <a href="https://basescan.org/tx/${result.txHash}">View on BaseScan</a>`;

        await ctx.telegram.editMessageText(
          statusMessage.chat.id,
          statusMessage.message_id,
          undefined,
          message,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          }
        );

        logger.error(`${logPrefix} Transfer failed: ${result.txHash}`);
      }
    } catch (receiptError) {
      logger.warn(
        `${logPrefix} Could not get receipt confirmation:`,
        receiptError
      );

      // Update with partial success
      message = `⚠️ <b>Transfer Submitted!</b>\n`;
      message += `💰 <b>Amount:</b> ${parsed.amount} ${generateClickeableToken(
        parsed.token,
        parsed.tokenAddress,
        parsed.isEthTransfer
      )}\n`;
      message += `👥 <b>Recipients:</b> ${recipients
        .map((r) => r.displayName)
        .join(", ")}\n`;

      // Add invalid recipients if any
      if (invalidRecipients.length > 0) {
        message += `❌ <b>Invalid:</b> ${invalidRecipients
          .map((inv) => inv.original)
          .join(", ")}\n`;
      }

      message += `🌐 <a href="https://basescan.org/tx/${result.txHash}">View on BaseScan</a>`;

      await ctx.telegram.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        undefined,
        message,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }
      );
    }
  } catch (error) {
    logger.error(`${logPrefix} Error executing transfer:`, error);

    // Update message with error
    if (statusMessage) {
      let errorMessage = `❌ <b>Transfer Failed!</b>\n`;
      errorMessage += `💰 <b>Amount:</b> ${
        parsed.amount
      } ${generateClickeableToken(
        parsed.token,
        parsed.tokenAddress,
        parsed.isEthTransfer
      )}\n`;
      errorMessage += `👥 <b>Recipients:</b> ${recipients
        .map((r) => r.displayName)
        .join(", ")}`;

      // Add invalid recipients if any
      if (invalidRecipients.length > 0) {
        errorMessage += `\n❌ <b>Invalid:</b> ${invalidRecipients
          .map((inv) => inv.original)
          .join(", ")}`;
      }

      if (error instanceof Error) {
        errorMessage += `\n💬 <b>Error:</b> <i>${error.message}</i>`;
      }

      try {
        await ctx.telegram.editMessageText(
          statusMessage.chat.id,
          statusMessage.message_id,
          undefined,
          errorMessage,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          }
        );
      } catch (editError) {
        logger.error(`${logPrefix} Failed to edit error message:`, editError);
        // Fallback: send new message
        await ctx.reply(errorMessage, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_parameters: { message_id: ctx.message?.message_id! },
        });
      }
    }

    throw error;
  }
}
