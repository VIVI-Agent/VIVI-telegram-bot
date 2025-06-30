import { GENERIC_BUTTONS, GENERIC_ERRORS } from "@texts";
import { BaseMenus, GlobalSceneContext } from "../../types";
import { CB } from "./callbacks";
import { TRADE_TEXTS } from "./messages";

interface TradeSceneData {
  menuMessageId?: number;
  tradeData?: any;
}

export class TradeMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "TradeMenus");
  }

  /**
   * Show the main trade menu
   */
  async showTradeMenu(
    ctx: GlobalSceneContext,
    sceneData: TradeSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing trade menu");

    try {
      const text = TRADE_TEXTS.FUNCTIONS.getTradeMessage();

      const keyboard = [
        [
          {
            text: TRADE_TEXTS.BUTTONS.BUY_TOKEN,
            callback_data: this.createCallback(CB.BUY_TOKEN),
          },
          {
            text: TRADE_TEXTS.BUTTONS.SELL_TOKEN,
            callback_data: this.createCallback(CB.SELL_TOKEN),
          },
        ],
        [
          {
            text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
            callback_data: this.createCallback(CB.MAIN_MENU),
          },
          {
            text: GENERIC_BUTTONS.DISMISS,
            callback_data: this.createCallback(CB.DISMISS_TRADE),
          },
        ],
      ];

      return await this.sendOrUpdateMenu(
        ctx,
        text,
        keyboard,
        "HTML",
        messageId
      );
    } catch (error) {
      this.log("error", ctx, `Error showing trade menu: ${error}`);
      await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
      return undefined;
    }
  }
}
