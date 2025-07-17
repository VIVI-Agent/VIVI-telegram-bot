import { BaseSubScene, GlobalSceneContext, PositionsSceneData } from "@types";
import { PositionsMenus } from "./PositionsMenus";
import { PositionsService } from "./PositionsService";
import { CB } from "./callbacks";
import { POSITIONS_TEXTS } from "./messages";
import { pnlUpdateEmitter, PnlUpdateEvent } from "@blockchain";

export class PositionsSubScene extends BaseSubScene<PositionsSceneData> {
  private menus: PositionsMenus;
  private service: PositionsService;
  private pnlUpdateListener?: (event: PnlUpdateEvent) => void;

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
      // Always refresh positions when entering the scene to ensure fresh data
      this.log("info", ctx, "Auto-refreshing positions on scene activation");
      const positions = await this.service.refreshPositions(ctx);

      sceneData.positions = positions.data;
      this.updateSceneData(ctx, sceneData);

      const menuMessageId = await this.menus.showPositionsMenu(ctx, sceneData);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }

      // Set up PnL update listener
      this.setupPnlUpdateListener(ctx);
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

  /**
   * Set up listener for PnL updates (instance-specific)
   */
  private setupPnlUpdateListener(ctx: GlobalSceneContext): void {
    // Clean up existing listener first
    this.cleanupPnlUpdateListener(ctx);

    // Subscribe this specific scene instance to PnL updates
    pnlUpdateEmitter.subscribe(ctx.user.id, this.instanceId, "Positions");

    this.pnlUpdateListener = async (event: PnlUpdateEvent) => {
      try {
        // 🛡️ PROTECTION 1: Check if this scene instance still exists
        if (!ctx.session?.activeSubScenes?.[this.instanceId]) {
          this.log(
            "warn",
            ctx,
            `Scene ${this.instanceId} no longer exists, ignoring PnL update`
          );
          // Auto-unsubscribe if scene no longer exists
          pnlUpdateEmitter.unsubscribe(this.instanceId);
          return;
        }

        // 🛡️ PROTECTION 2: Check if scene is still active
        const sceneState = ctx.session.activeSubScenes[this.instanceId];
        if (!sceneState || !sceneState.active) {
          this.log(
            "warn",
            ctx,
            `Scene ${this.instanceId} is not active, ignoring PnL update`
          );
          return;
        }

        this.log(
          "info",
          ctx,
          `Received PnL update for instance ${this.instanceId}, updating positions display`
        );

        // 🛡️ PROTECTION 3: Safely get scene data with fallback
        let sceneData;
        try {
          sceneData = this.getSceneData(ctx);
        } catch (error) {
          this.log(
            "error",
            ctx,
            `Failed to get scene data for ${this.instanceId}: ${error}`
          );
          return;
        }

        // 🛡️ PROTECTION 4: Check if we have required data
        if (!sceneData.menuMessageId) {
          this.log("warn", ctx, "No menu message ID available for update");
          return;
        }

        // Update scene data with fresh positions
        sceneData.positions = event.data;
        this.updateSceneData(ctx, sceneData);

        // 🛡️ PROTECTION 5: Safely update menu with error handling
        try {
          await this.menus.showPositionsMenu(
            ctx,
            sceneData,
            sceneData.menuMessageId
          );
          this.log("info", ctx, "Positions display updated successfully");
        } catch (menuError) {
          this.log(
            "error",
            ctx,
            `Failed to update positions menu: ${menuError}`
          );
          // Don't throw - this is a background update, shouldn't break user flow
        }
      } catch (error) {
        this.log(
          "error",
          ctx,
          `Error handling PnL update for ${this.instanceId}: ${error}`
        );
        // 🛡️ PROTECTION 6: If consistent errors, auto-cleanup
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("not found") ||
          errorMessage.includes("not exist")
        ) {
          this.log(
            "warn",
            ctx,
            `Auto-cleaning up listener for ${this.instanceId} due to persistent errors`
          );
          this.cleanupPnlUpdateListener(ctx);
        }
      }
    };

    // Set up instance-specific listener
    pnlUpdateEmitter.onInstancePnlUpdate(
      this.instanceId,
      this.pnlUpdateListener
    );

    this.log(
      "debug",
      ctx,
      `PnL update listener set up for instance ${this.instanceId} (user ${ctx.user.id})`
    );
  }

  /**
   * Clean up PnL update listener (idempotent - safe to call multiple times)
   */
  private cleanupPnlUpdateListener(ctx: GlobalSceneContext): void {
    try {
      // 🛡️ PROTECTION: Make cleanup idempotent
      if (this.pnlUpdateListener) {
        // Remove instance-specific listener
        pnlUpdateEmitter.removeInstancePnlListener(
          this.instanceId,
          this.pnlUpdateListener
        );

        this.pnlUpdateListener = undefined;

        this.log(
          "debug",
          ctx,
          `PnL update listener removed for instance ${this.instanceId} (user ${ctx.user.id})`
        );
      }

      // Always try to unsubscribe (even if listener was already removed)
      // This handles cases where subscription exists but listener was cleared
      pnlUpdateEmitter.unsubscribe(this.instanceId);

      this.log(
        "debug",
        ctx,
        `PnL update cleanup completed for instance ${this.instanceId} (user ${ctx.user.id})`
      );
    } catch (error) {
      // Don't throw during cleanup - just log and continue
      this.log(
        "warn",
        ctx,
        `Error during PnL listener cleanup for ${this.instanceId}: ${error}`
      );
    }
  }

  /**
   * Override cleanup to clean up listeners and cancel background operations
   */
  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up Positions scene");

    try {
      // 🛡️ PROTECTION: Cancel background operations first
      try {
        await this.service.cancelBackgroundOperations();
      } catch (serviceError) {
        this.log(
          "warn",
          ctx,
          `Error cancelling background operations: ${serviceError}`
        );
        // Continue with cleanup even if this fails
      }

      // 🛡️ PROTECTION: Clean up PnL update listener
      try {
        this.cleanupPnlUpdateListener(ctx);
      } catch (listenerError) {
        this.log(
          "warn",
          ctx,
          `Error cleaning up PnL listener: ${listenerError}`
        );
        // Continue with cleanup even if this fails
      }

      // 🛡️ PROTECTION: Call parent cleanup
      try {
        await super.cleanup(ctx);
      } catch (parentError) {
        this.log("warn", ctx, `Error in parent cleanup: ${parentError}`);
        // Continue - we want to log success even if parent cleanup has issues
      }

      this.log("debug", ctx, "Positions scene cleanup completed");
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Unexpected error during positions scene cleanup: ${error}`
      );
      // Log the full error for debugging
      console.error("[PositionsSubScene] Cleanup error details:", error);
      // Don't throw - cleanup should be robust
    }
  }
}
