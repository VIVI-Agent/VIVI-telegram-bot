import { BaseSubScene, GlobalSceneContext, MainMenuSceneData } from "@types";
import { MainMenuMenus } from "./MainMenuMenus";
import { MainMenuServices } from "./MainMenuServices";
import { CB } from "./callbacks";

export class MainMenuSubScene extends BaseSubScene<MainMenuSceneData> {
  private menus: MainMenuMenus;
  private services: MainMenuServices;

  constructor(instanceId: string) {
    super(instanceId, "MainMenu");
    this.menus = new MainMenuMenus(instanceId);
    this.services = new MainMenuServices(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating MainMenu scene");

    // Initialize scene data
    const sceneData: MainMenuSceneData = {
      menuMessageId: undefined,
    };

    // Update session data
    this.updateSceneData(ctx, sceneData);

    // Load user data and show main menu
    await this.loadUserAndShowMenu(ctx);
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up MainMenu scene");

    // Call parent cleanup for temp messages
    await super.cleanup(ctx);

    // Clean up main menu message
    const sceneData = this.getSceneData(ctx);
    if (sceneData.menuMessageId) {
      try {
        await ctx.deleteMessage(sceneData.menuMessageId);
      } catch (error) {
        this.log("debug", ctx, "Failed to delete menu message");
      }
    }
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
        case CB.BUY:
          await this.services.navigateToBuy(ctx);
          return true;

        case CB.SELL:
          await this.services.navigateToSell(ctx);
          return true;

        case CB.WALLETS:
          await this.services.navigateToWallets(ctx);
          return true;

        case CB.HOLDINGS:
          await this.services.navigateToHoldings(ctx);
          return true;

        case CB.WITHDRAW:
          await this.services.navigateToWithdraw(ctx);
          return true;

        case CB.SETTINGS:
          await this.services.navigateToSettings(ctx);
          return true;

        case CB.REF_LINK:
          await this.services.handleReferralLink(ctx);
          return true;

        case CB.LOGIN:
          await this.services.handleLogin(ctx);
          return true;

        case CB.REFRESH:
          return await this.handleRefresh(ctx);

        case CB.DISMISS:
          return await this.handleDismiss(ctx);

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
    // MainMenu doesn't handle text messages
    return false;
  }

  /**
   * Loads user data and displays the main menu
   */
  private async loadUserAndShowMenu(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Loading user data and showing menu");

    try {
      // Load user data
      const user = await this.services.loadUserData(ctx);

      if (!user) {
        this.log("warn", ctx, "Failed to load user data");
        await ctx.reply(
          "❌ Unable to load your profile. Please try again later."
        );
        await this.deactivateScene(ctx);
        return;
      }

      // Show main menu
      const messageId = await this.menus.showMainMenu(ctx, user, true);

      if (messageId > 0) {
        // Store menu message ID for cleanup
        this.updateSceneData(ctx, { menuMessageId: messageId });
        this.log("info", ctx, `Menu displayed with message ID: ${messageId}`);
      } else {
        this.log("warn", ctx, "Failed to display menu");
        await ctx.reply("❌ Failed to display menu. Please try again.");
      }
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error loading user and showing menu: ${
          error instanceof Error ? error.stack : error
        }`
      );
      await ctx.reply(
        "❌ An error occurred while loading the menu. Please try again."
      );
    }
  }

  /**
   * Handles menu refresh
   */
  private async handleRefresh(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("info", ctx, "Handling refresh request");

    try {
      // Use service to handle refresh
      const success = await this.services.handleRefresh(ctx);

      if (success) {
        // Reload user data and update menu
        const user = await this.services.loadUserData(ctx);

        if (user) {
          const sceneData = this.getSceneData(ctx);
          if (sceneData.menuMessageId) {
            // Update existing menu
            await this.menus.updateMainMenu(ctx, user, sceneData.menuMessageId);
          } else {
            // Show new menu if no existing message ID
            const messageId = await this.menus.showMainMenu(ctx, user, false);
            if (messageId > 0) {
              this.updateSceneData(ctx, { menuMessageId: messageId });
            }
          }
        }
      }

      return true;
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error handling refresh: ${
          error instanceof Error ? error.stack : error
        }`
      );
      await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
      return true;
    }
  }

  /**
   * Handles menu dismissal
   */
  private async handleDismiss(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("info", ctx, "Handling dismiss request");

    try {
      // Answer the callback query
      await this.services.handleDismiss(ctx);

      // Deactivate this scene (cleanup will handle message deletion)
      await ctx.sceneManager.deactivateScene(ctx, this.instanceId);

      return true;
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error handling dismiss: ${
          error instanceof Error ? error.stack : error
        }`
      );
      await ctx.answerCbQuery("❌ Error dismissing menu");
      return true;
    }
  }

  /**
   * Deactivates this scene (kept for compatibility, but now we use ctx.sceneManager directly)
   */
  private async deactivateScene(ctx: GlobalSceneContext): Promise<void> {
    try {
      await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error deactivating scene: ${
          error instanceof Error ? error.stack : error
        }`
      );
    }
  }
}
