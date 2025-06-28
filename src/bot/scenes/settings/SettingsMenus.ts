import { GENERIC_BUTTONS, GENERIC_ERRORS } from "@texts";
import {
  BaseMenus,
  BuySettingsFieldName,
  GlobalSceneContext,
  SellSettingsFieldName,
  SettingEditMode,
} from "@types";
import { UserWithSettings } from "@domain";
import { CB } from "./callbacks";
import { Markup } from "telegraf";
import { SETTINGS_TEXTS } from "./messages";

export class SettingsMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "SettingsMenus");
  }

  public async showSettingsMenu(
    ctx: GlobalSceneContext,
    messageId: number | undefined
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Settings menu");
    try {
      const inline_keyboard = this.buildSettingsMenuKeyboard();

      const message_id = await super.sendOrUpdateMenu(
        ctx,
        SETTINGS_TEXTS.MESSAGES.SETTINGS_ROOT,
        inline_keyboard,
        "HTML",
        messageId
      );

      return message_id;
    } catch (error) {
      this.logError(ctx, "showSettingsMenu", error);
    }
  }

  public async showSpeedMenu(
    ctx: GlobalSceneContext,
    user: UserWithSettings,
    messageId: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Speed menu");
    try {
      const inline_keyboard = this.buildSpeedMenuKeyboard(user);
      return await this.sendSpeedMenu(ctx, inline_keyboard, messageId);
    } catch (error) {
      this.logError(ctx, "showSpeedMenu", error);
    }
  }

  private async sendSpeedMenu(
    ctx: GlobalSceneContext,
    inline_keyboard: any[][],
    messageId: number
  ): Promise<number | undefined> {
    return await super.sendOrUpdateMenu(
      ctx,
      SETTINGS_TEXTS.MESSAGES.SPEED_SETTINGS_MSG_TEXT,
      inline_keyboard,
      "HTML",
      messageId
    );
  }

  public async showBuySettingsMenu(
    ctx: GlobalSceneContext,
    user: UserWithSettings,
    messageId: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Buy Settings menu");
    return await super.sendOrUpdateMenu(
      ctx,
      SETTINGS_TEXTS.MESSAGES.BUY_SETTINGS_MSG_TEXT,
      this.buildBuySettingsMenuKeyboard(user),
      "HTML",
      messageId
    );
  }

  public async showSellSettingsMenu(
    ctx: GlobalSceneContext,
    user: UserWithSettings,
    messageId: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Sell Settings menu");
    return await super.sendOrUpdateMenu(
      ctx,
      SETTINGS_TEXTS.MESSAGES.SELL_SETTINGS_MSG_TEXT,
      this.buildSellSettingsMenuKeyboard(user),
      "HTML",
      messageId
    );
  }

  async askBuyFieldValue(
    ctx: GlobalSceneContext,
    fieldName: BuySettingsFieldName
  ): Promise<number> {
    if (fieldName === "slippage") {
      const sent = await ctx.reply(SETTINGS_TEXTS.PROMPTS.ENTER_BUY_SLIPPAGE, {
        parse_mode: "Markdown",
        reply_markup: {
          force_reply: true,
        },
      });
      return sent.message_id;
    }

    const sent = await ctx.reply(SETTINGS_TEXTS.PROMPTS.ENTER_BUY_AMOUNT, {
      parse_mode: "Markdown",
      reply_markup: {
        force_reply: true,
      },
    });
    return sent.message_id;
  }

  async askSellFieldValue(
    ctx: GlobalSceneContext,
    fieldName: SellSettingsFieldName
  ): Promise<number> {
    if (fieldName === "slippage") {
      const sent = await ctx.reply(SETTINGS_TEXTS.PROMPTS.ENTER_SELL_SLIPPAGE, {
        parse_mode: "Markdown",
        reply_markup: {
          force_reply: true,
        },
      });
      return sent.message_id;
    }

    const sent = await ctx.reply(SETTINGS_TEXTS.PROMPTS.ENTER_SELL_PERCENT, {
      parse_mode: "Markdown",
      reply_markup: {
        force_reply: true,
      },
    });
    return sent.message_id;
  }

  private buildSellSettingsMenuKeyboard(user: UserWithSettings) {
    return [
      [
        Markup.button.callback(
          `${user.sellSettings!.amount1} Ξ ✏️`,
          this.createCallback(CB.EDIT_SELL_FIELD, "amount1")
        ),
        Markup.button.callback(
          `${user.sellSettings!.amount2} Ξ ✏️`,
          this.createCallback(CB.EDIT_SELL_FIELD, "amount2")
        ),
      ],
      [
        Markup.button.callback(
          `${user.sellSettings!.amount3} Ξ ✏️`,
          this.createCallback(CB.EDIT_SELL_FIELD, "amount3")
        ),
        Markup.button.callback(
          `Slippage: ${user.sellSettings!.slippage} % ✏️`,
          this.createCallback(CB.EDIT_SELL_FIELD, "slippage")
        ),
      ],
      [
        Markup.button.callback(
          GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          this.createCallback(CB.MAIN_MENU)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.BACK,
          this.createCallback(CB.SETTINGS_ROOT)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.DISMISS,
          this.createCallback(CB.DISMISS_SETTINGS)
        ),
      ],
    ];
  }

  private buildBuySettingsMenuKeyboard(user: UserWithSettings) {
    return [
      [
        Markup.button.callback(
          `${user.buySettings!.amount1} Ξ ✏️`,
          this.createCallback(CB.EDIT_BUY_FIELD, "amount1")
        ),
        Markup.button.callback(
          `${user.buySettings!.amount2} Ξ ✏️`,
          this.createCallback(CB.EDIT_BUY_FIELD, "amount2")
        ),
        Markup.button.callback(
          `${user.buySettings!.amount3} Ξ ✏️`,
          this.createCallback(CB.EDIT_BUY_FIELD, "amount3")
        ),
      ],
      [
        Markup.button.callback(
          `${user.buySettings!.amount4} Ξ ✏️`,
          this.createCallback(CB.EDIT_BUY_FIELD, "amount4")
        ),
        Markup.button.callback(
          `${user.buySettings!.amount5} Ξ ✏️`,
          this.createCallback(CB.EDIT_BUY_FIELD, "amount5")
        ),
        Markup.button.callback(
          `Slippage: ${user.buySettings!.slippage} % ✏️`,
          this.createCallback(CB.EDIT_BUY_FIELD, "slippage")
        ),
      ],
      [
        Markup.button.callback(
          GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          this.createCallback(CB.MAIN_MENU)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.BACK,
          this.createCallback(CB.SETTINGS_ROOT)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.DISMISS,
          this.createCallback(CB.DISMISS_SETTINGS)
        ),
      ],
    ];
  }

  private buildSpeedMenuKeyboard(user: UserWithSettings) {
    const inlineKeyboard = [
      [
        Markup.button.callback(
          SETTINGS_TEXTS.FUNCTIONS.speedMenuBtn("🚀", "AUTO", user.speed),
          this.createCallback(CB.SET_SPEED, "AUTO")
        ),
        Markup.button.callback(
          SETTINGS_TEXTS.FUNCTIONS.speedMenuBtn("⚡", "FAST", user.speed),
          this.createCallback(CB.SET_SPEED, "FAST")
        ),
        Markup.button.callback(
          SETTINGS_TEXTS.FUNCTIONS.speedMenuBtn("💨", "TURBO", user.speed),
          this.createCallback(CB.SET_SPEED, "TURBO")
        ),
      ],
      [
        Markup.button.callback(
          GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          this.createCallback(CB.MAIN_MENU)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.BACK,
          this.createCallback(CB.SETTINGS_ROOT)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.DISMISS,
          this.createCallback(CB.DISMISS_SETTINGS)
        ),
      ],
    ];
    return inlineKeyboard;
  }

  private buildSettingsMenuKeyboard() {
    return [
      [
        Markup.button.callback(
          SETTINGS_TEXTS.MESSAGES.EDIT_BUY_SETTINGS,
          this.createCallback(CB.EDIT_BUY_SETTINGS)
        ),
        Markup.button.callback(
          SETTINGS_TEXTS.MESSAGES.EDIT_SELL_SETTINGS,
          this.createCallback(CB.EDIT_SELL_SETTINGS)
        ),
      ],
      [
        Markup.button.callback(
          SETTINGS_TEXTS.MESSAGES.EDIT_SPEED_SETTINGS,
          this.createCallback(CB.EDIT_SPEED_SETTINGS)
        ),
      ],
      [
        Markup.button.callback(
          GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          this.createCallback(CB.MAIN_MENU)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.DISMISS,
          this.createCallback(CB.DISMISS_SETTINGS)
        ),
      ],
    ];
  }
}
