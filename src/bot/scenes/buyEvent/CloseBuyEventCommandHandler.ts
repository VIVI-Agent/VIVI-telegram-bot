import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

/**
 * Handler for /closebuyevent command
 * Allows admins to close active buy events in groups
 */
export class CloseBuyEventCommandHandler {
  async canExecute(ctx: GlobalSceneContext): Promise<boolean> {
    // Only works in groups/supergroups
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      return false;
    }

    // Check if user is admin
    try {
      const admins = await ctx.getChatAdministrators();
      const isAdmin = admins.some((admin) => admin.user.id === ctx.from?.id);
      if (!isAdmin) {
        await ctx.reply("Admins only, kiddo. 👵");
        return false;
      }
    } catch (error) {
      logger.error(
        `[CloseBuyEventCommandHandler] Error checking admin status: ${error}`
      );
      return false;
    }

    return true;
  }

  async execute(ctx: GlobalSceneContext): Promise<void> {
    const chatId = ctx.chat!.id.toString();

    try {
      // Get active event using the service
      const activeEvent =
        await ctx.services.buyEventService.getActiveGroupEventDetails(chatId);

      if (!activeEvent) {
        await ctx.reply("No active events, kiddo. ℹ️");
        return;
      }

      // Show confirmation dialog with eventId in callback data
      await ctx.replyWithHTML(
        `🧶 The event (<b>${activeEvent.name}</b>) will be closed...`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Close Event ✅",
                  callback_data: `confirm_close_event:${activeEvent.id}`,
                },
                {
                  text: "Dismiss ❌",
                  callback_data: `cancel_close_event:${activeEvent.id}`,
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      logger.error(
        `[CloseBuyEventCommandHandler] Error executing command: ${error}`
      );
      await ctx.reply("Error checking active events. Please try again.");
    }
  }
}
