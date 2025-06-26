import { BaseSubScene, GlobalSceneContext, SettingsSceneData } from "@types";

/**
 * Settings sub-scene for managing user trading configuration.
 */
export class SettingsSubScene extends BaseSubScene<SettingsSceneData> {
  constructor(instanceId: string) {
    super(instanceId, "Settings");
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Settings scene");

    // Initialize scene data
    const sceneData: SettingsSceneData = {
      step: "main_settings",
      userId: ctx.from?.id || 0,
      username: ctx.from?.username || "",
    };

    // Update session data
    this.updateSceneData(ctx, sceneData);

    await ctx.reply("⚙️ Settings scene activated");
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

    try {
      switch (action) {
        case "back_to_main_menu":
          await ctx.reply("🏠 Navigating to main menu...");
          return true;
        case "dismiss_settings":
          await ctx.answerCbQuery();
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
