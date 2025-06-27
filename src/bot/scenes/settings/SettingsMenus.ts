import { GENERIC_BUTTONS, GENERIC_ERRORS } from "@texts";
import { BaseMenus, GlobalSceneContext } from "@types";
import { UserWithSettings } from "@domain";
import { CB } from "./callbacks";
import { Markup } from "telegraf";
import { SETTINGS_TEXTS } from "./messages";

export class SettingsMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "SettingsMenus");
  }

  public async showSettingsMenu(
    ctx: GlobalSceneContext
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Settings menu");
    try {
      const inline_keyboard = this.buildSettingsMenuKeyboard();

      const messageId = await super.sendOrUpdateMenu(
        ctx,
        SETTINGS_TEXTS.MESSAGES.SETTINGS_ROOT,
        inline_keyboard,
        "HTML"
      );

      return messageId;
    } catch (error) {
      this.logError(ctx, "showSettingsMenu", error);
    }
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
