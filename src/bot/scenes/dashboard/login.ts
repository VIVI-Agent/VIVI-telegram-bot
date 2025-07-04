// src/handlers/loginHandler.ts
import jwt, { SignOptions } from "jsonwebtoken";

import { api } from "@config";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { GENERIC_BUTTONS, GENERIC_ERRORS } from "@texts";

function generateAuthToken(tgUserId: number, tgUsername: string): string {
  const payload = { tgUserId, tgUsername };

  const authToken = jwt.sign(payload, api.JWT_SECRET, {
    expiresIn: api.JWT_EXPIRATION,
  } as SignOptions);

  return authToken;
}

export const loginHandler = async (ctx: GlobalSceneContext): Promise<void> => {
  logger.info(
    `[/login] User ID: ${ctx.from?.id} - Username: ${ctx.from?.username}`
  );
  try {
    if (!ctx.from) {
      logger.info("[/login] No ctx.from. Exiting command.");
      return;
    }
    const tgUserId = ctx.from.id;
    const tgUsername = ctx.from.username;

    if (!tgUsername) {
      await ctx.reply(
        "Check your profile settings and set your telegram username, then press /login to continue."
      );
      return;
    }

    let user = ctx.user;
    if (!user) {
      logger.info(`[/login] User not found for tgUserId: ${tgUserId}.`);
      await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
      return;
    } else {
      const authToken = generateAuthToken(tgUserId, tgUsername);
      const authUrl = `${api.FRONTEND_URL}/login?authToken=${encodeURIComponent(
        authToken
      )}`;

      const sent = await ctx.reply(
        `<b>🔗 Access Dashboard</b>
        <i>Click the button below to log in.</i>
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Creating Dashboard Link ...",
                  url: authUrl,
                },
              ],
              [
                {
                  text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
                  callback_data: "BACK_TO_MAIN_MENU",
                },
                {
                  text: GENERIC_BUTTONS.DISMISS,
                  callback_data: "DISMISS",
                },
              ],
            ],
          },
        }
      );
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        sent.message_id,
        undefined,
        `<b>🔗 Access Dashboard</b>\n\n<i>Click the button below to log in.</i>
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Access Dashboard",
                  url: authUrl,
                },
              ],
              [
                {
                  text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
                  callback_data: `OPEN_MAIN_MENU_FROM_DASHBOARD:${sent.message_id}`,
                },
                {
                  text: GENERIC_BUTTONS.DISMISS,
                  callback_data: `DISMISS_DASHBOARD:${sent.message_id}`,
                },
              ],
            ],
          },
        }
      );
    }
  } catch (err) {
    logger.error("Error in /login command:", err);
    await ctx.reply("Error generating the authentication URL.");
    return;
  }
};
