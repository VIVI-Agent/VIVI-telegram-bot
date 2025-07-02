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
import { batchTransferService } from "../../blockchain/transactions/batchTransfer/batchTransferService";
import { ethBatchTransferService } from "../../blockchain/transactions/batchTransfer/ethBatchTransferService";
import { Wallet } from "@prisma/client";
import { decryptPrivateKey } from "@services";
import { publicClientQuickNode } from "@client";

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

    // Parse the command from the full match
    const commandText = match.params.fullMatch as string;
    const parsed = await parseSendCommand(commandText);

    if (!parsed) {
      await ctx.reply(
        "❌ Invalid send format. Examples:\n" +
          "• send 1 BOBR @username\n" +
          "• send 0.1 ETH to alice.base.eth\n" +
          "• send 100 tokens to @user1 @user2",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    logger.info(`${logPrefix} Parsed command:`, parsed);

    // Validate and resolve recipients
    const validatedRecipients = await validateAndResolveRecipients(
      ctx,
      parsed.recipients
    );

    if (validatedRecipients.length === 0) {
      await ctx.reply(
        "❌ No valid recipients found. Please check recipient formats and try again.",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
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
      resolvedToken.decimals
    );

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
  recipients: string[]
): Promise<ValidatedRecipient[]> {
  const logPrefix = "[validateAndResolveRecipients]";
  const validated: ValidatedRecipient[] = [];

  for (const recipient of recipients) {
    try {
      logger.debug(`${logPrefix} Validating recipient: ${recipient}`);

      // Check if it's a BNS name
      if (isBNSName(recipient)) {
        const address = await resolveBNSAddress(recipient);
        if (address) {
          validated.push({
            original: recipient,
            address,
            displayName: recipient,
            type: "bns",
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

      // Check if it's a Telegram username
      if (
        recipient.startsWith("@") ||
        /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(recipient)
      ) {
        const username = recipient.replace(/^@/, "");

        // Look up user in database
        const targetUser = await ctx.services.userService.getUserByUsername(
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
        }
      }

      logger.warn(`${logPrefix} Could not resolve recipient: ${recipient}`);
    } catch (error) {
      logger.error(
        `${logPrefix} Error validating recipient ${recipient}:`,
        error
      );
    }
  }

  return validated;
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
  tokenDecimals: number = 18
): Promise<void> {
  const logPrefix = "[executeSendCommand]";
  let statusMessage: any;

  try {
    logger.info(
      `${logPrefix} Executing send: ${parsed.amount} ${parsed.token} to ${recipients.length} recipients`
    );

    // Send initial status message
    let message = `⏳ <b>Submitting Transfer!</b>\n`;
    message += `💰 <b>Amount:</b> ${
      parsed.amount
    } ${parsed.token.toUpperCase()}\n`;
    message += `👥 <b>Recipients:</b> ${recipients
      .map((r) => r.displayName)
      .join(", ")}`;

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
    message += `💰 <b>Amount:</b> ${
      parsed.amount
    } ${parsed.token.toUpperCase()}\n`;
    message += `👥 <b>Recipients:</b> ${recipients
      .map((r) => r.displayName)
      .join(", ")}\n`;
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

    // Wait for confirmation
    try {
      const receipt = await result.waitReceipt;

      // Final success message
      message = `✅ <b>Transfer Successful!</b>\n`;
      message += `💰 <b>Amount:</b> ${
        parsed.amount
      } ${parsed.token.toUpperCase()}\n`;
      message += `👥 <b>Recipients:</b> ${recipients
        .map((r) => r.displayName)
        .join(", ")}\n`;
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

      logger.info(
        `${logPrefix} Transfer completed successfully: ${result.txHash}`
      );
    } catch (receiptError) {
      logger.warn(
        `${logPrefix} Could not get receipt confirmation:`,
        receiptError
      );

      // Update with partial success
      message = `⚠️ <b>Transfer Submitted!</b>\n`;
      message += `💰 <b>Amount:</b> ${
        parsed.amount
      } ${parsed.token.toUpperCase()}\n`;
      message += `👥 <b>Recipients:</b> ${recipients
        .map((r) => r.displayName)
        .join(", ")}\n`;
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
      } ${parsed.token.toUpperCase()}\n`;
      errorMessage += `👥 <b>Recipients:</b> ${recipients
        .map((r) => r.displayName)
        .join(", ")}`;

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
