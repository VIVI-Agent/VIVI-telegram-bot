import { GlobalSceneContext } from "../session/GlobalSceneContext";
import { logger } from "@logger";

/**
 * Base abstract class for all Menu classes
 * Provides common functionality like logging with user context and callback creation
 */
export abstract class BaseMenus {
  protected instanceId: string;
  protected menuName: string;

  constructor(instanceId: string, menuName: string) {
    this.instanceId = instanceId;
    this.menuName = menuName;

    logger.info(
      `[${this.menuName}] Created with instanceId: ${this.instanceId}`
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
    const logPrefix = `[${this.menuName}:${this.instanceId}] User ${userId}${
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
   * Helper method for logging without user context (when ctx is not available)
   */
  protected logWithoutContext(
    level: "info" | "warn" | "error" | "debug",
    message: string
  ): void {
    const logPrefix = `[${this.menuName}:${this.instanceId}]`;

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
   * Creates a callback with instanceId for proper routing
   */
  protected createCallback(action: string): string {
    return `${this.instanceId}:${action}`;
  }

  /**
   * Helper to handle errors consistently
   */
  protected logError(
    ctx: GlobalSceneContext | null,
    methodName: string,
    error: unknown
  ): void {
    const errorMessage = `Error in ${methodName}: ${
      error instanceof Error ? error.stack : error
    }`;

    if (ctx) {
      this.log("error", ctx, errorMessage);
    } else {
      this.logWithoutContext("error", errorMessage);
    }
  }
}
