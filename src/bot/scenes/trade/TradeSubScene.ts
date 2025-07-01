import { GENERIC_ERRORS } from "@texts";
import { BaseSubScene, GlobalSceneContext, TradeSceneData } from "../../types";
import { TradeMenus } from "./TradeMenus";
import { TradeService } from "./TradeService";
import { CB } from "./callbacks";
import { TRADE_TEXTS } from "./messages";

export class TradeSubScene extends BaseSubScene<TradeSceneData> {
  private menus: TradeMenus;
  private service: TradeService;

  constructor(instanceId: string) {
    super(instanceId, "Trade");
    this.menus = new TradeMenus(instanceId);
    this.service = new TradeService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Trade scene");

    // Initialize scene data
    const sceneData: TradeSceneData = {
      menuMessageId: undefined,
    };

    try {
      const menuMessageId = await this.menus.showTradeMenu(ctx, sceneData);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
    } catch (error) {
      this.log("error", ctx, `Error activating trade scene: ${error}`);
      await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
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

        case CB.DISMISS_TRADE:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;

        // Trade actions
        case CB.BUY_TOKEN:
          await ctx.answerCbQuery();
          // TODO: Implement buy token logic
          await ctx.reply("💚 Buy Token functionality coming soon!");
          return true;

        case CB.SELL_TOKEN:
          await ctx.answerCbQuery();
          // TODO: Implement sell token logic
          await ctx.reply("❤️ Sell Token functionality coming soon!");
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
