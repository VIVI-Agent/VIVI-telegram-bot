import { GlobalSceneContext } from "@types";
import { Markup } from "telegraf";
import { logger } from "@logger";
import { CB } from "./callbacks";
import { getMenuText } from "./messages";
import { secrets } from "@config";

/**
 * MainMenu menus and interface management
 */
export class MainMenuMenus {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Creates a callback with instanceId for proper routing
   */
  private createCallback(action: string): string {
    return `${this.instanceId}:${action}`;
  }

  /**
   * Shows the main menu with user data
   */
  public async showMainMenu(
    ctx: GlobalSceneContext,
    user: any,
    isFirstTime: boolean = true
  ): Promise<number> {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;

    logger.info(
      `[MainMenuMenus:showMainMenu] Rendering menu for user ${userId}${
        username ? ` (@${username})` : ""
      } (first time: ${isFirstTime}) - instanceId: ${this.instanceId}`
    );

    try {
      // Get all user wallets (guaranteed to exist by AuthMiddleware)
      const wallets = user.wallets || [];

      logger.debug(
        `[MainMenuMenus:showMainMenu] Building menu for ${wallets.length} wallets of user ${userId}`
      );

      // Calculate total balance across all wallets
      const totalBalance = wallets.reduce((acc: bigint, wallet: any) => {
        return acc + BigInt(wallet.balance || 0);
      }, BigInt(0));

      // Get menu text (simplified - no referral count for now)
      const text = getMenuText(
        totalBalance,
        user.points || 0,
        user.referralPoints || 0,
        user.totalVolumeBoughtWei || 0,
        user.totalVolumeSoldWei || 0,
        0 // userRefCount - simplified for now
      );

      // Build keyboard with instanceId callbacks
      const inlineKeyboard = this.buildMainMenuKeyboard();

      const replyOptions = {
        parse_mode: "HTML" as const,
        reply_markup: inlineKeyboard.reply_markup,
        link_preview_options: { is_disabled: true },
      };

      // Send message
      const sent = await ctx.reply(text, replyOptions);

      logger.info(
        `[MainMenuMenus:showMainMenu] Menu message ${sent.message_id} sent to user ${userId} with instanceId: ${this.instanceId}`
      );

      return sent.message_id;
    } catch (error) {
      logger.error(
        `[MainMenuMenus:showMainMenu] Error for user ${userId}: ${
          error instanceof Error ? error.stack : error
        }`
      );
      return 0;
    }
  }

  /**
   * Updates an existing main menu message
   */
  public async updateMainMenu(
    ctx: GlobalSceneContext,
    user: any,
    messageId: number
  ): Promise<boolean> {
    const userId = ctx.from?.id;

    logger.info(
      `[MainMenuMenus:updateMainMenu] Updating menu message ${messageId} for user ${userId} - instanceId: ${this.instanceId}`
    );

    try {
      // Get all user wallets (guaranteed to exist by AuthMiddleware)
      const wallets = user.wallets || [];

      // Calculate total balance
      const totalBalance = wallets.reduce((acc: bigint, wallet: any) => {
        return acc + BigInt(wallet.balance || 0);
      }, BigInt(0));

      // Get updated text (simplified - no referral count for now)
      const text = getMenuText(
        totalBalance,
        user.points || 0,
        user.referralPoints || 0,
        user.totalVolumeBoughtWei || 0,
        user.totalVolumeSoldWei || 0,
        0 // userRefCount - simplified for now
      );

      // Build keyboard with instanceId callbacks
      const inlineKeyboard = this.buildMainMenuKeyboard();

      // Update message
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        messageId,
        undefined,
        text,
        {
          parse_mode: "HTML",
          reply_markup: inlineKeyboard.reply_markup,
          link_preview_options: { is_disabled: true },
        }
      );

      logger.info(
        `[MainMenuMenus:updateMainMenu] Menu message ${messageId} updated for user ${userId} with instanceId: ${this.instanceId}`
      );
      return true;
    } catch (error) {
      logger.error(
        `[MainMenuMenus:updateMainMenu] Error updating menu for user ${userId}: ${
          error instanceof Error ? error.stack : error
        }`
      );
      return false;
    }
  }

  /**
   * Builds the main menu inline keyboard with instanceId callbacks
   */
  private buildMainMenuKeyboard() {
    const link = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?startgroup=bot_in_group`;

    const rows = [
      [Markup.button.url("👥 Add me to Group", link)],
      [
        Markup.button.callback(
          "🔗 Access Dashboard",
          this.createCallback(CB.LOGIN)
        ),
      ],
      [
        Markup.button.callback("🛒 Buy", this.createCallback(CB.BUY)),
        Markup.button.callback("💸 Sell", this.createCallback(CB.SELL)),
      ],
      [
        Markup.button.callback("🤝 Referral", this.createCallback(CB.REF_LINK)),
        Markup.button.callback(
          "🔄 Refresh Balance",
          this.createCallback(CB.REFRESH)
        ),
      ],
      [
        Markup.button.callback(
          "💰 Positions",
          this.createCallback(CB.HOLDINGS)
        ),
        Markup.button.callback("💼 Wallets", this.createCallback(CB.WALLETS)),
      ],
      [
        Markup.button.callback("📤 Withdraw", this.createCallback(CB.WITHDRAW)),
        Markup.button.callback("⚙️ Settings", this.createCallback(CB.SETTINGS)),
      ],
      [Markup.button.callback("x Dismiss", this.createCallback(CB.DISMISS))],
    ];

    return Markup.inlineKeyboard(rows);
  }

  /**
   * Shows a refreshing state message
   */
  public async showRefreshingMessage(ctx: GlobalSceneContext): Promise<number> {
    const userId = ctx.from?.id;

    logger.info(
      `[MainMenuMenus:showRefreshingMessage] Showing refreshing message for user ${userId} - instanceId: ${this.instanceId}`
    );

    try {
      const sent = await ctx.reply("🔄 Refreshing Balance...");
      return sent.message_id;
    } catch (error) {
      logger.error(`[MainMenuMenus:showRefreshingMessage] Error: ${error}`);
      return 0;
    }
  }

  /**
   * Shows a success message after refresh
   */
  public async showRefreshSuccess(ctx: GlobalSceneContext): Promise<void> {
    const userId = ctx.from?.id;

    logger.info(
      `[MainMenuMenus:showRefreshSuccess] Showing refresh success for user ${userId} - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.reply("✅ ETH and Tokens balances refreshed!");
    } catch (error) {
      logger.error(`[MainMenuMenus:showRefreshSuccess] Error: ${error}`);
    }
  }

  /**
   * Shows an error message after refresh failure
   */
  public async showRefreshError(ctx: GlobalSceneContext): Promise<void> {
    const userId = ctx.from?.id;

    logger.warn(
      `[MainMenuMenus:showRefreshError] Showing refresh error for user ${userId} - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.reply("❌ Failed to refresh balance. Please try again.");
    } catch (error) {
      logger.error(`[MainMenuMenus:showRefreshError] Error: ${error}`);
    }
  }
}
