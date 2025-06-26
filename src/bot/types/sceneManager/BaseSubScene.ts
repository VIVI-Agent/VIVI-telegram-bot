import { ISubScene } from "./ISubScene";
import { GlobalSceneContext } from "../session/GlobalSceneContext";
import { logger } from "@logger";

/**
 * Base abstract class for all SubScenes
 * Provides common functionality like logging, scene data management, and error handling
 */
export abstract class BaseSubScene<TSceneData = any> implements ISubScene {
  public instanceId: string;
  public name: string;

  constructor(instanceId: string, name: string) {
    this.instanceId = instanceId;
    this.name = name;

    logger.info(
      `[${this.name}SubScene] Created with instanceId: ${this.instanceId}`
    );
  }

  /**
   * Helper method for consistent logging with user context
   */
  protected log(
    level: "info" | "warn" | "error" | "debug",
    ctx: GlobalSceneContext,
    message: string
  ): void {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const logPrefix = `[${this.name}SubScene:${
      this.instanceId
    }] User ${userId}${username ? ` (@${username})` : ""}`;

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
   * Gets scene data from session with proper typing
   */
  protected getSceneData(ctx: GlobalSceneContext): TSceneData {
    const sceneState = ctx.session.activeSubScenes[this.instanceId];
    return (sceneState?.data as TSceneData) || ({} as TSceneData);
  }

  /**
   * Updates scene data in session with proper typing
   */
  protected updateSceneData(
    ctx: GlobalSceneContext,
    data: Partial<TSceneData>
  ): void {
    const sceneState = ctx.session.activeSubScenes[this.instanceId];
    if (sceneState) {
      sceneState.data = { ...this.getSceneData(ctx), ...data };
    }
  }

  /**
   * Creates a callback with instanceId for proper routing
   */
  protected createCallback(action: string): string {
    return `${this.instanceId}:${action}`;
  }

  /**
   * Validates that a callback belongs to this scene instance
   */
  protected validateCallbackInstanceId(
    callback: string
  ): { instanceId: string; action: string } | null {
    const [instanceId, action] = callback.split(":", 2);

    if (instanceId !== this.instanceId) {
      return null;
    }

    return { instanceId, action };
  }

  /**
   * Standard cleanup for temporary messages
   */
  protected async cleanupTempMessages(ctx: GlobalSceneContext): Promise<void> {
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
  }

  /**
   * Helper to handle errors consistently in callback processing
   */
  protected async handleCallbackError(
    ctx: GlobalSceneContext,
    action: string,
    error: unknown,
    userMessage: string = "❌ An error occurred. Please try again."
  ): Promise<void> {
    this.log(
      "error",
      ctx,
      `Error handling callback ${action}: ${
        error instanceof Error ? error.stack : error
      }`
    );
    await ctx.answerCbQuery(userMessage);
  }

  /**
   * Default cleanup implementation - can be overridden by subclasses
   */
  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, `Cleaning up ${this.name} scene`);
    await this.cleanupTempMessages(ctx);
  }

  // Abstract methods that must be implemented by subclasses
  abstract onActivate(ctx: GlobalSceneContext, data?: any): Promise<void>;
  abstract handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean>;
  abstract handleText(ctx: GlobalSceneContext, text: string): Promise<boolean>;
}
