import { GENERIC_ERRORS } from "@texts";
import {
  BaseSubScene,
  GlobalSceneContext,
  ReferralSceneData,
} from "../../types";
import { ReferralMenus } from "./ReferralMenus";
import { ReferralService } from "./ReferralService";
import { CB } from "./callbacks";

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
    return false;
  }
}
