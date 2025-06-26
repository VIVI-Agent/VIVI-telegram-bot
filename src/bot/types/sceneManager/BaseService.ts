import { GlobalSceneContext } from "../session/GlobalSceneContext";
import { logger } from "@logger";

/**
 * Base abstract class for all Service classes
 * Provides common functionality like logging with user context
 */
export abstract class BaseService {
  protected instanceId: string;
  protected serviceName: string;

  constructor(instanceId: string, serviceName: string) {
    this.instanceId = instanceId;
    this.serviceName = serviceName;

    logger.info(
      `[${this.serviceName}] Created with instanceId: ${this.instanceId}`
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
    const logPrefix = `[${this.serviceName}:${this.instanceId}] User ${userId}${
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
    const logPrefix = `[${this.serviceName}:${this.instanceId}]`;

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
