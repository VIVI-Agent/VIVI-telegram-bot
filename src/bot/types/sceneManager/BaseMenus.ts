import { GlobalSceneContext } from "../session/GlobalSceneContext";
import { logger } from "@logger";

/**
 * Base abstract class for all Menu classes
 * Provides common functionality like logging with user context and callback creation
 */
export abstract class BaseMenus {
  protected instanceId: string;
  protected menuName: string;

  constructor(instanceId: string, menuName: string) {
    this.instanceId = instanceId;
    this.menuName = menuName;

    logger.info(
      `[${this.menuName}] Created with instanceId: ${this.instanceId}`
    );
  }

  /**
   * Helper method for consistent logging with user context
   */
  protected log(
    level: "info" | "warn" | "error" | "debug",
    ctx: GlobalSceneContext,
    message: string
  ): void {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const logPrefix = `[${this.menuName}:${this.instanceId}] User ${userId}${
      username ? ` (@${username})` : ""
    }`;

    switch (level) {
      case "info":
        logger.info(`${logPrefix} - ${message}`);
        break;
      case "warn":
        logger.warn(`${logPrefix} - ${message}`);
        break;
      case "error":
        logger.error(`${logPrefix} - ${message}`);
        break;
      case "debug":
        logger.debug(`${logPrefix} - ${message}`);
        break;
    }
  }

  /**
   * Helper method for logging without user context (when ctx is not available)
   */
  protected logWithoutContext(
    level: "info" | "warn" | "error" | "debug",
    message: string
  ): void {
    const logPrefix = `[${this.menuName}:${this.instanceId}]`;

    switch (level) {
      case "info":
        logger.info(`${logPrefix} - ${message}`);
        break;
      case "warn":
        logger.warn(`${logPrefix} - ${message}`);
        break;
      case "error":
        logger.error(`${logPrefix} - ${message}`);
        break;
      case "debug":
        logger.debug(`${logPrefix} - ${message}`);
        break;
    }
  }

  /**
   * Creates a callback with instanceId for proper routing
   */
  protected createCallback(action: string): string {
    return `${this.instanceId}:${action}`;
  }

  /**
   * Helper to handle errors consistently
   */
  protected logError(
    ctx: GlobalSceneContext | null,
    methodName: string,
    error: unknown
  ): void {
    const errorMessage = `Error in ${methodName}: ${
      error instanceof Error ? error.stack : error
    }`;

    if (ctx) {
      this.log("error", ctx, errorMessage);
    } else {
      this.logWithoutContext("error", errorMessage);
    }
  }

  /**
   * Sends a new message or updates an existing message with the provided content.
   * Attempts to edit the existing message first, falls back to sending a new message if editing fails.
   * This provides consistent single-message navigation across all scenes.
   *
   * @param ctx - The Telegram context object
   * @param text - The message text to display
   * @param inlineKeyboard - The inline keyboard buttons array
   * @param parseMode - The parse mode for the message (Markdown or HTML)
   * @param messageId - Optional message ID to edit instead of sending a new message
   * @returns Promise resolving to the message ID of the sent/edited message
   */
  protected async sendOrUpdateMenu(
    ctx: GlobalSceneContext,
    text: string,
    inlineKeyboard: any[][],
    parseMode: "Markdown" | "HTML" = "HTML",
    messageId?: number
  ): Promise<number> {
    try {
      // Try to edit existing message if messageId is provided
      if (messageId && messageId > 0) {
        this.log("debug", ctx, `Attempting to edit message ${messageId}`);

        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          messageId,
          undefined,
          text,
          {
            parse_mode: parseMode,
            reply_markup: { inline_keyboard: inlineKeyboard },
          }
        );

        this.log("debug", ctx, `Successfully edited message ${messageId}`);
        return messageId; // Return the same messageId
      }
    } catch (error) {
      // If editing fails (message too old, etc.), fall back to sending a new message
      this.log(
        "warn",
        ctx,
        `Failed to edit message ${messageId}: ${
          error instanceof Error ? error.message : error
        }. Sending new message.`
      );
    }

    // Send new message if no messageId provided or editing failed
    this.log("debug", ctx, "Sending new message");

    const sent = await ctx.reply(text, {
      parse_mode: parseMode,
      reply_markup: { inline_keyboard: inlineKeyboard },
    });

    this.log("debug", ctx, `New message sent with ID: ${sent.message_id}`);
    return sent.message_id;
  }
}
