import { BaseSubScene, GlobalSceneContext, SettingsSceneData } from "@types";
import { SettingsMenus } from "./SettingsMenus";
import { SettingsService } from "./SettingsService";
import { CB } from "./callbacks";

/**
 * Settings sub-scene for managing user trading configuration.
 */
export class SettingsSubScene extends BaseSubScene<SettingsSceneData> {
  menus: SettingsMenus;

  private services: SettingsService;

  constructor(instanceId: string) {
    super(instanceId, "Settings");
    this.menus = new SettingsMenus(instanceId);
    this.services = new SettingsService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Settings scene");

    // Initialize scene data
    const sceneData: SettingsSceneData = {
      step: "main_settings",
      userId: ctx.from?.id || 0,
      username: ctx.from?.username || "",
      menuMessageId: undefined,
    };

    const user = await this.services.loadUserData(ctx);

    if (user) {
      sceneData.user = user;

      this.updateSceneData(ctx, sceneData);
      const menuMessageId = await this.menus.showSettingsMenu(ctx, undefined);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
    }
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up Settings scene");

    // Call parent cleanup for temp messages
    await super.cleanup(ctx);
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    // Validate callback belongs to this instance
    const validation = this.validateCallbackInstanceId(callback);
    if (!validation) {
      this.log("debug", ctx, `InstanceId mismatch, skipping`);
      return false;
    }

    const { action } = validation;
    this.log("info", ctx, `Processing action: ${action}`);

    const sceneData = this.getSceneData(ctx);

    try {
      switch (action) {
        case CB.EDIT_SPEED_SETTINGS:
          await ctx.answerCbQuery();
          const user = sceneData.user!;
          await this.menus.showSpeedMenu(ctx, user, sceneData.menuMessageId!);
          return true;
        case CB.MAIN_MENU:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;
        case CB.DISMISS_SETTINGS:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;
        case CB.BACK_TO_SETTINGS_ROOT:
          await ctx.answerCbQuery();
          await this.menus.showSettingsMenu(ctx, sceneData.menuMessageId);
          return true;
        default:
          this.log("warn", ctx, `Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      await this.handleCallbackError(ctx, action, error);
      return true; // We handled it, even if there was an error
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `Handling text: ${text}`);
    await ctx.reply(`📝 Settings received: ${text}`);
    return true;
  }
}
