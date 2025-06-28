import { logger } from "@logger";
import { BaseSubScene, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { WalletsMenus } from "./WalletsMenus";
import { WalletsService } from "./WalletsService";
import { CB } from "./callbacks";
import { WALLETS_TEXTS } from "./messages";

export class WalletsSubScene extends BaseSubScene<WalletsSceneData> {
  private menus: WalletsMenus;
  private service: WalletsService;

  constructor(instanceId: string) {
    super(instanceId, "WalletsSubScene");
    this.menus = new WalletsMenus(instanceId);
    this.service = new WalletsService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Wallets scene");

    // Initialize scene data
    const sceneData: WalletsSceneData = {
      userId: ctx.from?.id || 0,
      username: ctx.from?.username || "",
      menuMessageId: undefined,
    };

    const user = await this.service.loadUserData(ctx, ctx.user.id);

    if (user) {
      sceneData.user = user;
      this.updateSceneData(ctx, sceneData);

      const menuMessageId = await this.menus.showWalletsMenu(ctx, sceneData);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
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
        case CB.MAIN_MENU:
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
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
    this.log("debug", ctx, `Handling text: ${text}`);
    // Basic implementation
    return false;
  }
}
