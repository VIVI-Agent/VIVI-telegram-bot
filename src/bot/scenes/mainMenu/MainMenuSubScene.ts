import { logger } from "@logger";
import { ISubScene, GlobalSceneContext, MainMenuSceneData } from "@types";
import { MainMenuMenus } from "./menus";
import { MainMenuServices } from "./services";
import { CB } from "./callbacks";

export class MainMenuSubScene implements ISubScene {
  instanceId: string;
  name: string = "MainMenu";
  private menus: MainMenuMenus;
  private services: MainMenuServices;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.menus = new MainMenuMenus(instanceId);
    this.services = new MainMenuServices(instanceId);

    logger.info(
      `[MainMenuSubScene] Created with instanceId: ${this.instanceId}`
    );
  }

  /**
   * Helper method for consistent logging with user context
   */
  private log(
    level: "info" | "warn" | "error" | "debug",
    ctx: GlobalSceneContext,
    message: string
  ): void {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const logPrefix = `[MainMenuSubScene:${this.instanceId}] User ${userId}${
      username ? ` (@${username})` : ""
    }`;

    switch (level) {
      case "info":
        logger.info(`${logPrefix} - ${message}`);
        break;
      case "warn":
        logger.warn(`${logPrefix} - ${message}`);
        break;
      case "error":
        logger.error(`${logPrefix} - ${message}`);
        break;
      case "debug":
        logger.debug(`${logPrefix} - ${message}`);
        break;
    }
  }

  /**
   * Gets scene data from session
   */
  private getSceneData(ctx: GlobalSceneContext): MainMenuSceneData {
    const sceneState = ctx.session.activeSubScenes[this.instanceId];
    return (sceneState?.data as MainMenuSceneData) || {};
  }

  /**
   * Updates scene data in session
   */
  private updateSceneData(
    ctx: GlobalSceneContext,
    data: Partial<MainMenuSceneData>
  ): void {
    const sceneState = ctx.session.activeSubScenes[this.instanceId];
    if (sceneState) {
      sceneState.data = { ...this.getSceneData(ctx), ...data };
    }
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating MainMenu scene");

    // Initialize scene data
    const sceneData: MainMenuSceneData = {
      menuMessageId: undefined,
    };

    // Update session data
    ctx.session.activeSubScenes[this.instanceId].data = sceneData;

    // Load user data and show main menu
    await this.loadUserAndShowMenu(ctx);
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up MainMenu scene");

    // Clean up any temporary messages
    const sceneState = ctx.session.activeSubScenes[this.instanceId];
    if (sceneState?.tempMessageIds) {
      for (const messageId of sceneState.tempMessageIds) {
        try {
          await ctx.deleteMessage(messageId);
        } catch (error) {
          this.log("debug", ctx, `Failed to delete temp message ${messageId}`);
        }
      }
    }

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

    // Extract action from callback (format: "instanceId:action")
    const [instanceId, action] = callback.split(":", 2);

    // Only handle callbacks for this scene instance
    if (instanceId !== this.instanceId) {
      this.log(
        "debug",
        ctx,
        `InstanceId mismatch (${instanceId} vs ${this.instanceId}), skipping`
      );
      return false;
    }

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
      this.log(
        "error",
        ctx,
        `Error handling callback ${action}: ${
          error instanceof Error ? error.stack : error
        }`
      );
      await ctx.answerCbQuery("❌ An error occurred. Please try again.");
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
