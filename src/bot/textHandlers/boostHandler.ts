import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { TextHandler, TextMatch } from "./types";
import { Address, formatEther, parseEther } from "viem";
import { User, Wallet } from "@prisma/client";
import { decryptPrivateKey, getWalletBalance } from "@services";
import { transferETH } from "@blockchain";
import { publicClientQuickNode } from "@client";
import { sleep, formatHash, viviJoin } from "@utils";
import { GENERIC_ERRORS } from "@texts";
import { explorerUrl } from "@client";

/**
 * Boost text handler - adapted for TextManager
 * Handles boost commands with format: boost vivi <amount>
 */
export const boostTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch
): Promise<boolean> => {
  const logPrefix = "[boostTextHandler]";

  try {
    logger.debug(
      `${logPrefix} Processing boost command with params:`,
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
    const parsed = parseBoostCommand(commandText);

    if (!parsed) {
      await ctx.reply(
        "❌ Invalid boost format. Usage:\n" +
          "• boost vivi 0.001\n" +
          "• boost vivi 0.1\n" +
          "• boost vivi 1",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    logger.info(`${logPrefix} Parsed command:`, parsed);

    // Validate that target is "vivi"
    if (parsed.target.toLowerCase() !== "vivi") {
      await ctx.reply(
        "Patience, darlings — only VIVI gets the boost, rest gotta wait.",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    // Validate amount - only numeric values allowed (no "half" or "all")
    if (
      !parsed.amount ||
      isNaN(Number(parsed.amount)) ||
      Number(parsed.amount) <= 0
    ) {
      await ctx.reply(
        "Sorry kiddo, please provide a valid ETH amount (e.g., 0.001, 0.1, 1)",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    // VIVI contract address
    const viviAddress = "0x7cA2eF9bb750b5e0fEE8B07B7bddC2Ea1735741C";

    logger.debug(
      `${logPrefix} Processing boost: ${parsed.amount} ETH to VIVI address ${viviAddress}`
    );

    // Get user's selected wallet
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
    const senderAddress = senderWallet.address as Address;

    // Get sender ETH balance
    const senderBalanceBN = await getWalletBalance(senderAddress);
    if (senderBalanceBN === 0n) {
      await ctx.reply("Sorry kiddo, not enough ETH in your wallet", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // Parse amount
    let amountToSendBN: bigint;
    try {
      amountToSendBN = parseEther(parsed.amount);
    } catch (e) {
      await ctx.reply("Sorry kiddo, invalid ETH amount", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // Check if user has enough ETH
    if (senderBalanceBN < amountToSendBN) {
      await ctx.reply("Sorry kiddo, you don't have enough ETH for this boost", {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
      });
      return true;
    }

    // Send initial status message
    const viviLink = `<a href="https://basescan.org/address/0x7ca2ef9bb750b5e0fee8b07b7bddc2ea1735741c">VIVI</a>`;
    const pendingMessage = await ctx.reply(
      `⏳ Pending Boost for ${formatEther(
        amountToSendBN
      )} ETH on ${viviLink}\n` + `${viviJoin(ctx.from?.username)}`,
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message?.message_id! },
        link_preview_options: { is_disabled: true },
      }
    );

    // Execute the transfer
    const privateKey = decryptPrivateKey(senderWallet.encryptedPrivKey);
    const tx = await transferETH({
      privateKey: privateKey,
      to: viviAddress as Address,
      desiredAmountWei: amountToSendBN,
    });

    logger.info(`${logPrefix} Transaction submitted: ${tx.txHash}`);
    const explorerLink = `${explorerUrl}/tx/${tx.txHash}`;

    // Wait for transaction confirmation
    try {
      const receipt = await tx.waitReceipt;
      if (receipt.status === "success") {
        logger.info(`${logPrefix} Transaction confirmed: ${tx.txHash}`);

        // Update sender's ETH balance in background
        setImmediate(async () => {
          await sleep(2000);
          try {
            const newSenderBalanceBN = await getWalletBalance(senderAddress);
            await ctx.services.walletService.updateWalletBalance(
              senderWallet.id,
              newSenderBalanceBN
            );
            logger.debug(
              `${logPrefix} Balance update completed for ${tx.txHash}`
            );
          } catch (err) {
            logger.error(`${logPrefix} Background update error:`, err);
          }
        });

        // Update pending message with confirmation
        await ctx.telegram.editMessageText(
          ctx.chat?.id!,
          pendingMessage.message_id,
          undefined,
          `⚡️ Confirmed Boost for ${formatEther(
            amountToSendBN
          )} ETH on ${viviLink}\n` +
            `<a href="${explorerLink}">🔗 TX Hash</a> | ${viviJoin(
              ctx.from?.username
            )}`,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          }
        );
      } else {
        // Transaction failed
        logger.error(`${logPrefix} Transaction failed: ${tx.txHash}`);
        await ctx.telegram.editMessageText(
          ctx.chat?.id!,
          pendingMessage.message_id,
          undefined,
          `❌ Failed Boost TX for ${viviLink}. Please try again later.\n` +
            `<a href="${explorerLink}">${formatHash(tx.txHash)}</a>`,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          }
        );
      }
    } catch (receiptError) {
      logger.warn(
        `${logPrefix} Could not get receipt confirmation:`,
        receiptError
      );

      // Update with partial success
      await ctx.telegram.editMessageText(
        ctx.chat?.id!,
        pendingMessage.message_id,
        undefined,
        `⚠️ Boost Submitted for ${viviLink}\n` +
          `<a href="${explorerLink}">🔗 TX Hash</a> | ${viviJoin(
            ctx.from?.username
          )}`,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }
      );
    }

    logger.info(
      `${logPrefix} Successfully boosted ${parsed.amount} ETH to VIVI`
    );
    return true;
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    const errorMessage =
      error instanceof Error ? error.message : "Boost failed";

    // Escape HTML characters to prevent parsing errors
    const escapedErrorMessage = errorMessage
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    await ctx.reply(escapedErrorMessage, {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message?.message_id! },
      link_preview_options: { is_disabled: true },
    });

    return true; // We handled it (even if with error)
  }
};

interface ParsedBoostCommand {
  target: string;
  amount: string;
}

/**
 * Parse boost command text into structured data
 */
function parseBoostCommand(commandText: string): ParsedBoostCommand | null {
  const logPrefix = "[parseBoostCommand]";

  // Remove "boost" from the beginning and trim
  const cleanText = commandText.replace(/^boost\s+/i, "").trim();

  logger.debug(`${logPrefix} Parsing: "${cleanText}"`);

  // Split by spaces and filter out empty strings
  const words = cleanText.split(/\s+/).filter((word) => word.length > 0);

  if (words.length !== 2) {
    logger.warn(`${logPrefix} Invalid number of words: ${words.length}`);
    return null;
  }

  const target = words[0];
  const amount = words[1];

  // Validate amount format
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    logger.warn(`${logPrefix} Invalid amount format: ${amount}`);
    return null;
  }

  logger.debug(`${logPrefix} Parsed - Target: ${target}, Amount: ${amount}`);

  return {
    target,
    amount,
  };
}
