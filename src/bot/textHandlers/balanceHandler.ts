import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { TextHandler, TextMatch } from "./types";
import { balanceHandler as originalBalanceHandler } from "./balance";

/**
 * Balance text handler - adapted for TextManager
 * Handles:
 * - "balance" -> shows user's own balance
 * - "balance @username" -> shows target user's balance
 */
export const balanceTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch
): Promise<boolean> => {
  const logPrefix = "[balanceTextHandler]";

  try {
    logger.debug(
      `${logPrefix} Processing balance command with params:`,
      match.params
    );

    // Extract target username if provided
    const targetUsername = match.params.username || match.params.group1;

    // Get message ID for replies (fallback to current message if available)
    const messageId = ctx.message?.message_id || Date.now();

    logger.info(
      `${logPrefix} Showing balance${
        targetUsername ? ` for ${targetUsername}` : " for current user"
      }`
    );

    // Call the original balance handler
    await originalBalanceHandler(ctx, messageId, targetUsername);

    return true; // Successfully handled
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    // Send error message to user
    try {
      await ctx.reply(
        "❌ Sorry, there was an error getting the balance. Please try again.",
        { parse_mode: "HTML" }
      );
    } catch (replyError) {
      logger.error(`${logPrefix} Failed to send error message:`, replyError);
    }

    return true; // We handled it (even if with error)
  }
};
