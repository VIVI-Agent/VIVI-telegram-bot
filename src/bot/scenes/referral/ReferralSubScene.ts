import { GENERIC_ERRORS } from "@texts";
import {
  BaseSubScene,
  GlobalSceneContext,
  ReferralSceneData,
} from "../../types";
import { ReferralMenus } from "./ReferralMenus";
import { ReferralService } from "./ReferralService";
import { CB } from "./callbacks";
import { REFERRAL_TEXTS } from "./messages";

export class ReferralSubScene extends BaseSubScene<ReferralSceneData> {
  private menus: ReferralMenus;
  private service: ReferralService;

  constructor(instanceId: string) {
    super(instanceId, "Referral");
    this.menus = new ReferralMenus(instanceId);
    this.service = new ReferralService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Referral scene");

    // Initialize scene data
    const sceneData: ReferralSceneData = {
      menuMessageId: undefined,
    };

    try {
      const user = await this.service.loadUserWithReferralData(ctx);

      if (user) {
        sceneData.user = user;
        this.updateSceneData(ctx, sceneData);

        const menuMessageId = await this.menus.showReferralMenu(ctx, sceneData);

        if (menuMessageId) {
          sceneData.menuMessageId = menuMessageId;
          this.updateSceneData(ctx, sceneData);
        }
      } else {
        ctx.reply(GENERIC_ERRORS.OLD_VERSION);
      }
    } catch (error) {
      this.log("error", ctx, `Error activating referral scene: ${error}`);
    }
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    const validationResult = this.validateCallbackInstanceId(callback);
    if (!validationResult) {
      this.log("debug", ctx, "InstanceId mismatch, skipping");
      return false;
    }

    const { action } = validationResult;
    this.log("info", ctx, `Processing action: ${action}`);

    try {
      switch (action) {
        // Main navigation
        case CB.MAIN_MENU:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;

        case CB.DISMISS_REFERRAL:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;

        case CB.SET_REWARD_WALLET:
          await ctx.answerCbQuery();
          const sceneData = this.getSceneData(ctx);
          if (sceneData?.menuMessageId) {
            await this.menus.showSetRewardWalletPrompt(
              ctx,
              sceneData.menuMessageId
            );
            // Set state to expect wallet address input
            this.updateSceneData(ctx, {
              ...sceneData,
              expectingWalletInput: true,
            });
          }
          return true;

        default:
          this.log("warn", ctx, `Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error in handleCallback: ${
          error instanceof Error ? error.message : error
        }`
      );
      return false;
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    const sceneData = this.getSceneData(ctx);

    if (sceneData?.expectingWalletInput) {
      try {
        // Set reward wallet
        await this.service.setRewardWallet(ctx, text);

        // Get updated user data
        const updatedUser = await this.service.loadUserWithReferralData(ctx);

        // Update scene data
        const updatedSceneData = {
          ...sceneData,
          user: updatedUser,
          expectingWalletInput: false,
        };
        this.updateSceneData(ctx, updatedSceneData);

        // Show success message and refresh menu
        if (updatedSceneData.menuMessageId) {
          // Get reward wallet balance for success message
          let balance: string | null = null;
          if ((updatedUser as any)?.rewardWallet) {
            try {
              const { getWalletBalance } = await import("@blockchain");
              const balanceWei = await getWalletBalance(
                (updatedUser as any).rewardWallet
              );
              balance = (Number(balanceWei) / 1e18).toFixed(6);
            } catch (error) {
              this.log(
                "error",
                ctx,
                `Error fetching reward wallet balance: ${error}`
              );
            }
          }

          const successMessage =
            REFERRAL_TEXTS.MESSAGES.REWARD_WALLET_UPDATED.replace(
              "{rewardWallet}",
              `\`${text}\``
            ).replace(
              "{balanceInfo}",
              balance !== null
                ? REFERRAL_TEXTS.MESSAGES.BALANCE_INFO.replace(
                    "{balance}",
                    balance
                  )
                : REFERRAL_TEXTS.MESSAGES.BALANCE_UNAVAILABLE
            );

          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            updatedSceneData.menuMessageId,
            undefined,
            successMessage,
            { parse_mode: "HTML" }
          );

          // Wait a moment and then refresh the menu
          setTimeout(async () => {
            await this.menus.showReferralMenu(
              ctx,
              updatedSceneData,
              updatedSceneData.menuMessageId
            );
          }, 2000);
        }

        return true;
      } catch (error) {
        this.log("error", ctx, `Error setting reward wallet: ${error}`);
        await ctx.reply(
          `❌ Error: ${
            error instanceof Error ? error.message : "Invalid wallet address"
          }`
        );
        return true;
      }
    }

    return false;
  }
}
