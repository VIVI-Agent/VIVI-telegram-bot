import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { TextHandler, TextMatch } from "./types";
import { secrets } from "@config";

/**
 * Invite text handler - adapted for TextManager
 * Handles:
 * - "invite" -> shows referral link for user registration
 */
export const inviteTextHandler: TextHandler = async (
  ctx: GlobalSceneContext,
  match: TextMatch
): Promise<boolean> => {
  const logPrefix = "[inviteTextHandler]";

  try {
    logger.debug(
      `${logPrefix} Processing invite command with params:`,
      match.params
    );

    // Get user info
    if (!ctx.from?.username) {
      await ctx.reply(
        "❌ You need to have a Telegram username to generate a referral link.",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
      return true;
    }

    const tgUsername = ctx.from.username;
    logger.info(
      `${logPrefix} Generating referral link for user: @${tgUsername}`
    );

    // Create referral link
    const referralLink = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=ref=${tgUsername}`;

    // Send response
    await ctx.reply(
      `<b>Join VIVI 🥃</b> <a href="${referralLink}">register</a> 🤝`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: ctx.message?.message_id! },
      }
    );

    logger.info(
      `${logPrefix} Successfully generated referral link for @${tgUsername}`
    );
    return true; // Successfully handled
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);

    // Send error message to user
    try {
      await ctx.reply(
        "❌ Sorry, there was an error generating your referral link. Please try again.",
        {
          parse_mode: "HTML",
          reply_parameters: { message_id: ctx.message?.message_id! },
        }
      );
    } catch (replyError) {
      logger.error(`${logPrefix} Failed to send error message:`, replyError);
    }

    return true; // We handled it (even if with error)
  }
};
