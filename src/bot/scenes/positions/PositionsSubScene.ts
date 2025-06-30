import { BaseSubScene, GlobalSceneContext, PositionsSceneData } from "@types";
import { PositionsMenus } from "./PositionsMenus";
import { PositionsService } from "./PositionsService";
import { CB } from "./callbacks";
import { POSITIONS_TEXTS } from "./messages";

export class PositionsSubScene extends BaseSubScene<PositionsSceneData> {
  private menus: PositionsMenus;
  private service: PositionsService;

  constructor(instanceId: string) {
    super(instanceId, "Positions");
    this.menus = new PositionsMenus(instanceId);
    this.service = new PositionsService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Positions scene");

    // Initialize scene data
    const sceneData: PositionsSceneData = {
      menuMessageId: undefined,
      state: "loading_cache",
    };

    try {
      const { data } = await this.service.loadUserPnl(ctx);

      sceneData.positions = data;
      this.updateSceneData(ctx, sceneData);

      const menuMessageId = await this.menus.showPositionsMenu(ctx, sceneData);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
    } catch (error) {
      this.log("error", ctx, `Error activating positions scene: ${error}`);
      await ctx.reply(POSITIONS_TEXTS.ERRORS.LOADING_FAILED);
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

    const { action, params } = validationResult;
    this.log("info", ctx, `Processing action: ${action}`);

    const sceneData = this.getSceneData(ctx);
    const messageId = sceneData.menuMessageId;

    try {
      switch (action) {
        // Main navigation
        case CB.MAIN_MENU:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;

        case CB.POSITIONS_ROOT:
          await ctx.answerCbQuery();
          await this.menus.showPositionsMenu(ctx, sceneData, messageId);
          return true;

        case CB.DISMISS_POSITIONS:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;

        // Position actions
        case CB.REFRESH_POSITIONS:
          await ctx.answerCbQuery();
          try {
            const positions = await this.service.refreshPositions(ctx);
            sceneData.positions = positions.data;
            this.updateSceneData(ctx, sceneData);
            await this.menus.showPositionsMenu(ctx, sceneData, messageId);
          } catch (error) {
            this.log("error", ctx, `Error refreshing positions: ${error}`);
            await ctx.reply(POSITIONS_TEXTS.ERRORS.LOADING_FAILED);
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
    this.log("debug", ctx, `Handling text: ${text}`);

    // TODO: Implement text handling if needed
    return false;
  }

  private resetSceneData(ctx: GlobalSceneContext): void {
    const sceneData = this.getSceneData(ctx);
    // Reset any temporary data if needed
    this.updateSceneData(ctx, sceneData);
  }
}
