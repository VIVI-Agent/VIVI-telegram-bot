import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { batchTransferService } from "../../blockchain/transactions/batchTransfer/batchTransferService";
import { ethBatchTransferService } from "../../blockchain/transactions/batchTransfer/ethBatchTransferService";
import { decryptPrivateKey, getWalletBalance } from "@services";
import { getTokenBalance } from "@blockchain";
import {
  sleep,
  generateShareableTransferMessage,
  generateClickeableToken,
} from "@utils";

const logPrefix = "[sendCallbacks]";

/**
 * Handle send confirmation callback
 */
export async function handleSendConfirm(
  ctx: GlobalSceneContext
): Promise<void> {
  try {
    const pendingTransfer = ctx.session.pendingTransfer;

    if (!pendingTransfer) {
      await ctx.answerCbQuery("❌ No pending transfer found");
      return;
    }

    // Get sender wallet
    const senderWallet = await ctx.services.walletService.getWalletWithHoldings(
      pendingTransfer.senderWalletId
    );
    if (!senderWallet) {
      await ctx.answerCbQuery("❌ Sender wallet not found");
      delete ctx.session.pendingTransfer;
      return;
    }

    // Execute the transfer
    await executePendingTransfer(ctx, pendingTransfer, senderWallet);

    // Clear pending transfer
    delete ctx.session.pendingTransfer;

    await ctx.answerCbQuery("✅ Transfer confirmed and executed!");
  } catch (error) {
    logger.error(`${logPrefix} Error handling send confirmation:`, error);
    await ctx.answerCbQuery("❌ Error executing transfer");

    // Try to delete the confirmation message on error
    if (ctx.session.pendingTransfer) {
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat!.id,
          ctx.session.pendingTransfer.messageId
        );
      } catch (deleteError) {
        logger.warn(
          `${logPrefix} Could not delete confirmation message on error:`,
          deleteError
        );
      }
    }

    // Clear pending transfer on error
    delete ctx.session.pendingTransfer;
  }
}

/**
 * Handle send cancellation callback
 */
export async function handleSendCancel(ctx: GlobalSceneContext): Promise<void> {
  try {
    const pendingTransfer = ctx.session.pendingTransfer;

    if (!pendingTransfer) {
      await ctx.answerCbQuery("❌ No pending transfer found");
      return;
    }

    // Clear pending transfer
    delete ctx.session.pendingTransfer;

    // Try to delete the confirmation message
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, pendingTransfer.messageId);
    } catch (error) {
      logger.warn(`${logPrefix} Could not delete confirmation message:`, error);
    }

    await ctx.answerCbQuery("❌ Transfer cancelled");
  } catch (error) {
    logger.error(`${logPrefix} Error handling send cancellation:`, error);
    await ctx.answerCbQuery("❌ Error cancelling transfer");

    // Clear pending transfer on error
    delete ctx.session.pendingTransfer;
  }
}

/**
 * Execute a pending transfer
 */
async function executePendingTransfer(
  ctx: GlobalSceneContext,
  pendingTransfer: any,
  senderWallet: any
): Promise<void> {
  const logPrefix = "[executePendingTransfer]";
  let statusMessage: any;

  try {
    logger.info(
      `${logPrefix} Executing pending transfer: ${pendingTransfer.amount} ${pendingTransfer.token} to ${pendingTransfer.recipients.length} recipients`
    );

    // Send initial status message
    let message = `⏳ <b>Submitting Transfer!</b>\n`;
    message += `💰 <b>Amount:</b> ${
      pendingTransfer.amount
    } ${generateClickeableToken(
      pendingTransfer.token,
      pendingTransfer.tokenAddress,
      pendingTransfer.isEthTransfer
    )}\n`;
    message += `👥 <b>Recipients:</b> ${pendingTransfer.recipients
      .map((r: any) => r.displayName)
      .join(", ")}`;

    // Add invalid recipients if any
    if (pendingTransfer.invalidRecipients.length > 0) {
      message += `\n👥 <b>Invalid:</b> ${pendingTransfer.invalidRecipients
        .map((inv: any) => inv.original)
        .join(", ")}`;
    }

    statusMessage = await ctx.reply(message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

    // Calculate amount with correct decimals
    const amountWithDecimals = BigInt(
      parseFloat(pendingTransfer.amount) *
        Math.pow(10, pendingTransfer.tokenDecimals)
    );

    let result;

    // Use different services based on whether it's ETH or token transfer
    if (pendingTransfer.isEthTransfer) {
      // Use ETH batch transfer service for native ETH
      result = await ethBatchTransferService({
        ctx,
        privateKey: decryptPrivateKey(senderWallet.encryptedPrivKey),
        recipients: pendingTransfer.recipients.map((r: any) => ({
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
        tokenAddress: pendingTransfer.tokenAddress,
        recipients: pendingTransfer.recipients.map((r: any) => ({
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
      pendingTransfer.amount
    } ${generateClickeableToken(
      pendingTransfer.token,
      pendingTransfer.tokenAddress,
      pendingTransfer.isEthTransfer
    )}\n`;
    message += `👥 <b>Recipients:</b> ${pendingTransfer.recipients
      .map((r: any) => r.displayName)
      .join(", ")}`;

    // Add invalid recipients if any
    if (pendingTransfer.invalidRecipients.length > 0) {
      message += `\n❌ <b>Invalid:</b> ${pendingTransfer.invalidRecipients
        .map((inv: any) => inv.original)
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
          pendingTransfer.amount
        } ${generateClickeableToken(
          pendingTransfer.token,
          pendingTransfer.tokenAddress,
          pendingTransfer.isEthTransfer
        )}\n`;
        message += `👥 <b>Recipients:</b> ${pendingTransfer.recipients
          .map((r: any) => r.displayName)
          .join(", ")}\n`;

        // Add invalid recipients if any
        if (pendingTransfer.invalidRecipients.length > 0) {
          message += `❌ <b>Invalid:</b> ${pendingTransfer.invalidRecipients
            .map((inv: any) => inv.original)
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
                              pendingTransfer.amount,
                              pendingTransfer.token,
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

        // Delete the confirmation message
        try {
          await ctx.telegram.deleteMessage(
            ctx.chat!.id,
            pendingTransfer.messageId
          );
        } catch (error) {
          logger.warn(
            `${logPrefix} Could not delete confirmation message:`,
            error
          );
        }

        // Update balances in background (same logic as in sendHandler)
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

            if (pendingTransfer.isEthTransfer) {
              // ETH transfer - update ETH balances
              const [newSenderEthBalance] = await Promise.all([
                getWalletBalance(senderWallet.address as any),
              ]);

              await ctx.services.walletService.updateWalletBalance(
                senderWallet.id,
                newSenderEthBalance
              );

              logger.debug(`${logPrefix} Updated sender ETH balance`);

              // Update recipient balances for Telegram users
              for (const recipient of pendingTransfer.recipients) {
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
                  pendingTransfer.token
                );

              if (!tokenInfo?.token) {
                logger.error(
                  `${logPrefix} Token info not found for ${pendingTransfer.token}`
                );
                return;
              }

              const [newSenderEthBalance, newSenderTokenBalance] =
                await Promise.all([
                  getWalletBalance(walletRecord.address as any),
                  getTokenBalance(
                    tokenInfo.token.address as any,
                    walletRecord.address as any
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
              for (const recipient of pendingTransfer.recipients) {
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
                            tokenInfo.token.address as any,
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
          pendingTransfer.amount
        } ${generateClickeableToken(
          pendingTransfer.token,
          pendingTransfer.tokenAddress,
          pendingTransfer.isEthTransfer
        )}\n`;
        message += `👥 <b>Recipients:</b> ${pendingTransfer.recipients
          .map((r: any) => r.displayName)
          .join(", ")}\n`;

        // Add invalid recipients if any
        if (pendingTransfer.invalidRecipients.length > 0) {
          message += `❌ <b>Invalid:</b> ${pendingTransfer.invalidRecipients
            .map((inv: any) => inv.original)
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

        // Delete the confirmation message
        try {
          await ctx.telegram.deleteMessage(
            ctx.chat!.id,
            pendingTransfer.messageId
          );
        } catch (error) {
          logger.warn(
            `${logPrefix} Could not delete confirmation message:`,
            error
          );
        }
      }
    } catch (receiptError) {
      logger.warn(
        `${logPrefix} Could not get receipt confirmation:`,
        receiptError
      );

      // Update with partial success
      message = `⚠️ <b>Transfer Submitted!</b>\n`;
      message += `💰 <b>Amount:</b> ${
        pendingTransfer.amount
      } ${generateClickeableToken(
        pendingTransfer.token,
        pendingTransfer.tokenAddress,
        pendingTransfer.isEthTransfer
      )}\n`;
      message += `👥 <b>Recipients:</b> ${pendingTransfer.recipients
        .map((r: any) => r.displayName)
        .join(", ")}\n`;

      // Add invalid recipients if any
      if (pendingTransfer.invalidRecipients.length > 0) {
        message += `❌ <b>Invalid:</b> ${pendingTransfer.invalidRecipients
          .map((inv: any) => inv.original)
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

      // Delete the confirmation message
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat!.id,
          pendingTransfer.messageId
        );
      } catch (error) {
        logger.warn(
          `${logPrefix} Could not delete confirmation message:`,
          error
        );
      }
    }
  } catch (error) {
    logger.error(`${logPrefix} Error executing transfer:`, error);

    // Update message with error
    if (statusMessage) {
      let errorMessage = `❌ <b>Transfer Failed!</b>\n`;
      errorMessage += `💰 <b>Amount:</b> ${
        pendingTransfer.amount
      } ${generateClickeableToken(
        pendingTransfer.token,
        pendingTransfer.tokenAddress,
        pendingTransfer.isEthTransfer
      )}\n`;
      errorMessage += `👥 <b>Recipients:</b> ${pendingTransfer.recipients
        .map((r: any) => r.displayName)
        .join(", ")}`;

      // Add invalid recipients if any
      if (pendingTransfer.invalidRecipients.length > 0) {
        errorMessage += `\n❌ <b>Invalid:</b> ${pendingTransfer.invalidRecipients
          .map((inv: any) => inv.original)
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
        });
      }
    }

    // Delete the confirmation message on any error
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, pendingTransfer.messageId);
    } catch (deleteError) {
      logger.warn(
        `${logPrefix} Could not delete confirmation message on error:`,
        deleteError
      );
    }

    throw error;
  }
}
