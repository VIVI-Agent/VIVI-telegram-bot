import { BaseMenus, GlobalSceneContext } from "@types";
import { Markup } from "telegraf";
import { CB } from "./callbacks";
import { MAIN_MENU_TEXTS } from "./messages";
import { secrets } from "@config";
import { GENERIC_BUTTONS } from "@texts";

/**
 * MainMenu menus and interface management
 */
export class MainMenuMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "MainMenuMenus");
  }

  /**
   * Shows the main menu with user data
   */
  public async showMainMenu(
    ctx: GlobalSceneContext,
    user: any,
    isFirstTime: boolean = true
  ): Promise<number> {
    this.log("info", ctx, `Rendering menu (first time: ${isFirstTime})`);

    try {
      // Get all user wallets (guaranteed to exist by AuthMiddleware)
      const wallets = user.wallets || [];

      this.log("debug", ctx, `Building menu for ${wallets.length} wallets`);

      // Calculate total balance across all wallets
      const totalBalance = wallets.reduce((acc: bigint, wallet: any) => {
        return acc + BigInt(wallet.balance || 0);
      }, BigInt(0));

      // Get menu text (simplified - no referral count for now)
      const text = MAIN_MENU_TEXTS.FUNCTIONS.getMenuText(
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

      this.log("info", ctx, `Menu message ${sent.message_id} sent`);

      return sent.message_id;
    } catch (error) {
      this.logError(ctx, "showMainMenu", error);
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
    this.log("info", ctx, `Updating menu message ${messageId}`);

    try {
      // Get all user wallets (guaranteed to exist by AuthMiddleware)
      const wallets = user.wallets || [];

      // Calculate total balance
      const totalBalance = wallets.reduce((acc: bigint, wallet: any) => {
        return acc + BigInt(wallet.balance || 0);
      }, BigInt(0));

      // Get updated text (simplified - no referral count for now)
      const text = MAIN_MENU_TEXTS.FUNCTIONS.getMenuText(
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

      this.log("info", ctx, `Menu message ${messageId} updated`);
      return true;
    } catch (error) {
      this.logError(ctx, "updateMainMenu", error);
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
          MAIN_MENU_TEXTS.BUTTONS.LOGIN,
          this.createCallback(CB.LOGIN)
        ),
      ],
      [
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.SNIPE,
          this.createCallback(CB.SNIPE)
        ),
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.BUY,
          this.createCallback(CB.BUY)
        ),
      ],
      [
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.HOLDINGS,
          this.createCallback(CB.HOLDINGS)
        ),
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.REFRESH,
          this.createCallback(CB.REFRESH)
        ),
      ],
      [
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.LIMIT_ORDER,
          this.createCallback(CB.LIMIT_ORDER)
        ),
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.WALLETS,
          this.createCallback(CB.WALLETS)
        ),
      ],
      [
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.REF_LINK,
          this.createCallback(CB.REF_LINK)
        ),
        Markup.button.callback(
          MAIN_MENU_TEXTS.BUTTONS.SETTINGS,
          this.createCallback(CB.SETTINGS)
        ),
      ],
      [
        Markup.button.callback(
          GENERIC_BUTTONS.DISMISS,
          this.createCallback(CB.DISMISS)
        ),
      ],
    ];

    return Markup.inlineKeyboard(rows);
  }
}
