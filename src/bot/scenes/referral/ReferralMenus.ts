import { BaseMenus, GlobalSceneContext, ReferralSceneData } from "../../types";
import { Markup } from "telegraf";
import { CB } from "./callbacks";
import { REFERRAL_TEXTS } from "./messages";
import { secrets } from "@config";
import { GENERIC_BUTTONS } from "@texts";

export class ReferralMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "ReferralMenus");
  }

  /**
   * Show the main referral menu
   */
  async showReferralMenu(
    ctx: GlobalSceneContext,
    sceneData: ReferralSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing referral menu");

    try {
      const referralLink = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=ref_${sceneData.user.tgUsername}`;

      const text = REFERRAL_TEXTS.FUNCTIONS.getReferralMessage(
        referralLink,
        sceneData.user.referrals.length,
        sceneData.user.totalReferralVolume,
        sceneData.user.referralPoints
      );

      const keyboard = [
        [
          Markup.button.callback(
            GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
            this.createCallback(CB.MAIN_MENU)
          ),
          Markup.button.callback(
            GENERIC_BUTTONS.DISMISS,
            this.createCallback(CB.DISMISS_REFERRAL)
          ),
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
      this.log("error", ctx, `Error showing referral menu: ${error}`);
      return undefined;
    }
  }
}
