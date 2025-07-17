import { BaseMenus, GlobalSceneContext, ReferralSceneData } from "../../types";
import { Markup } from "telegraf";
import { CB } from "./callbacks";
import { REFERRAL_TEXTS } from "./messages";
import { secrets } from "@config";
import { GENERIC_BUTTONS } from "@texts";
import { getWalletBalance } from "@blockchain";

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
      const referralLink = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=ref=${sceneData.user.tgUsername}`;

      // Get reward wallet balance if configured
      let balance: string | null = null;
      if (sceneData.user.rewardWallet) {
        try {
          const balanceWei = await getWalletBalance(
            sceneData.user.rewardWallet
          );
          balance = (Number(balanceWei) / 1e18).toFixed(6);
        } catch (error) {
          this.log(
            "error",
            ctx,
            `Error fetching reward wallet balance: ${error}`
          );
          balance = null;
        }
      }

      const text = REFERRAL_TEXTS.FUNCTIONS.getReferralMessage(
        referralLink,
        sceneData.user.referrals.length,
        sceneData.user.totalReferralVolume,
        sceneData.user.referralPoints,
        sceneData.user.rewardWallet,
        balance
      );

      const keyboard = [
        [
          Markup.button.callback(
            REFERRAL_TEXTS.BUTTONS.SET_REWARD_WALLET,
            this.createCallback(CB.SET_REWARD_WALLET)
          ),
        ],
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

  /**
   * Show the set reward wallet prompt
   */
  async showSetRewardWalletPrompt(
    ctx: GlobalSceneContext,
    messageId: number
  ): Promise<void> {
    this.log("info", ctx, "Showing Set Reward Wallet prompt");

    const inline_keyboard = [
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

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      messageId,
      undefined,
      REFERRAL_TEXTS.MESSAGES.SET_REWARD_WALLET,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard },
      }
    );
  }
}
