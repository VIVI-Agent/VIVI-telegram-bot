import { EventEmitter } from "events";
import { logger } from "@logger";

export interface PnlUpdateEvent {
  userId: number;
  instanceId?: string;
  data: any[];
  timestamp: Date;
}

interface PnlSubscription {
  userId: number;
  instanceId: string;
  sceneType: string;
}

export class PnlUpdateEmitter extends EventEmitter {
  private static instance: PnlUpdateEmitter;
  private subscriptions: Map<string, PnlSubscription> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow multiple scenes to listen
  }

  static getInstance(): PnlUpdateEmitter {
    if (!PnlUpdateEmitter.instance) {
      PnlUpdateEmitter.instance = new PnlUpdateEmitter();
    }
    return PnlUpdateEmitter.instance;
  }

  subscribe(userId: number, instanceId: string, sceneType: string): void {
    this.subscriptions.set(instanceId, { userId, instanceId, sceneType });
    logger.debug(
      `[PnlUpdateEmitter] Scene ${sceneType}:${instanceId} subscribed for user ${userId}`
    );
  }

  unsubscribe(instanceId: string): void {
    const subscription = this.subscriptions.get(instanceId);
    if (subscription) {
      this.subscriptions.delete(instanceId);
      logger.debug(
        `[PnlUpdateEmitter] Scene ${subscription.sceneType}:${instanceId} unsubscribed for user ${subscription.userId}`
      );
    }
  }

  emitPnlUpdate(userId: number, data: any[]): void {
    const timestamp = new Date();

    // 🛡️ PROTECTION: Check if subscriptions map exists
    if (!this.subscriptions) {
      logger.debug(
        `[PnlUpdateEmitter] Subscriptions map is null, aborting emit for user ${userId}`
      );
      return;
    }

    const userSubscriptions = Array.from(this.subscriptions.values()).filter(
      (sub) => sub.userId === userId
    );

    if (userSubscriptions.length === 0) {
      logger.debug(
        `[PnlUpdateEmitter] No subscriptions found for user ${userId}`
      );
      return;
    }

    logger.debug(
      `[PnlUpdateEmitter] Emitting PnL update for user ${userId} to ${userSubscriptions.length} instances`
    );

    // Emit to each subscribed instance with safety checks
    const validSubscriptions: string[] = [];
    const expiredSubscriptions: string[] = [];

    userSubscriptions.forEach((subscription) => {
      try {
        // 🛡️ PROTECTION: Double-check subscription still exists
        if (!this.subscriptions.has(subscription.instanceId)) {
          logger.debug(
            `[PnlUpdateEmitter] Subscription ${subscription.instanceId} expired during emission`
          );
          expiredSubscriptions.push(subscription.instanceId);
          return;
        }

        const event: PnlUpdateEvent = {
          userId,
          instanceId: subscription.instanceId,
          data,
          timestamp,
        };

        // Emit instance-specific event
        this.emit(`pnl:updated:${subscription.instanceId}`, event);

        validSubscriptions.push(subscription.instanceId);

        logger.debug(
          `[PnlUpdateEmitter] Sent update to ${subscription.sceneType}:${subscription.instanceId}`
        );
      } catch (error) {
        logger.error(
          `[PnlUpdateEmitter] Error emitting to ${subscription.instanceId}: ${error}`
        );
        expiredSubscriptions.push(subscription.instanceId);
      }
    });

    // Clean up any expired subscriptions found during emission
    if (expiredSubscriptions.length > 0) {
      logger.debug(
        `[PnlUpdateEmitter] Cleaning up ${expiredSubscriptions.length} expired subscriptions`
      );
      expiredSubscriptions.forEach((instanceId) => {
        this.unsubscribe(instanceId);
      });
    }

    logger.debug(
      `[PnlUpdateEmitter] Successfully emitted to ${validSubscriptions.length}/${userSubscriptions.length} instances for user ${userId}`
    );

    // Also emit general event for backward compatibility
    const generalEvent: PnlUpdateEvent = { userId, data, timestamp };
    this.emit("pnl:updated", generalEvent);
    this.emit(`pnl:updated:${userId}`, generalEvent);
  }

  onInstancePnlUpdate(
    instanceId: string,
    callback: (event: PnlUpdateEvent) => void
  ): void {
    this.on(`pnl:updated:${instanceId}`, callback);
  }

  removeInstancePnlListener(
    instanceId: string,
    callback: (event: PnlUpdateEvent) => void
  ): void {
    this.removeListener(`pnl:updated:${instanceId}`, callback);
  }

  removeAllInstanceListeners(instanceId: string): void {
    this.removeAllListeners(`pnl:updated:${instanceId}`);
  }

  onUserPnlUpdate(
    userId: number,
    callback: (event: PnlUpdateEvent) => void
  ): void {
    this.on(`pnl:updated:${userId}`, callback);
  }

  removeUserPnlListener(
    userId: number,
    callback: (event: PnlUpdateEvent) => void
  ): void {
    this.removeListener(`pnl:updated:${userId}`, callback);
  }

  removeAllUserListeners(userId: number): void {
    this.removeAllListeners(`pnl:updated:${userId}`);
  }

  getSubscriptionCount(userId?: number): number {
    // 🛡️ PROTECTION: Check if subscriptions map exists
    if (!this.subscriptions) {
      return 0;
    }

    if (userId) {
      return Array.from(this.subscriptions.values()).filter(
        (sub) => sub.userId === userId
      ).length;
    }
    return this.subscriptions.size;
  }

  getSubscriptions(userId?: number): PnlSubscription[] {
    // 🛡️ PROTECTION: Check if subscriptions map exists
    if (!this.subscriptions) {
      return [];
    }

    const allSubs = Array.from(this.subscriptions.values());
    return userId ? allSubs.filter((sub) => sub.userId === userId) : allSubs;
  }
}

export const pnlUpdateEmitter = PnlUpdateEmitter.getInstance();
