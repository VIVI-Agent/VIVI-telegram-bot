import { EventEmitter } from "events";
import { logger } from "@logger";

export interface TokenInfoUpdateEvent {
  tokenAddress: string;
  instanceId?: string;
  data: {
    marketCap?: string;
    totalSupply?: string;
    holders?: string;
    website?: string;
    telegramLink?: string;
    twitterLink?: string;
  };
  timestamp: Date;
}

interface TokenInfoSubscription {
  tokenAddress: string;
  instanceId: string;
  sceneType: string;
}

export class TokenInfoUpdateEmitter extends EventEmitter {
  private static instance: TokenInfoUpdateEmitter;
  private subscriptions: Map<string, TokenInfoSubscription> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow multiple scenes to listen
  }

  static getInstance(): TokenInfoUpdateEmitter {
    if (!TokenInfoUpdateEmitter.instance) {
      TokenInfoUpdateEmitter.instance = new TokenInfoUpdateEmitter();
    }
    return TokenInfoUpdateEmitter.instance;
  }

  /**
   * Register a scene instance as interested in token info updates
   */
  subscribe(tokenAddress: string, instanceId: string, sceneType: string): void {
    this.subscriptions.set(instanceId, { tokenAddress, instanceId, sceneType });
    logger.debug(
      `[TokenInfoUpdateEmitter] Scene ${sceneType}:${instanceId} subscribed for token ${tokenAddress}`
    );
  }

  /**
   * Unregister a scene instance from token info updates
   */
  unsubscribe(instanceId: string): void {
    const subscription = this.subscriptions.get(instanceId);
    if (subscription) {
      this.subscriptions.delete(instanceId);
      logger.debug(
        `[TokenInfoUpdateEmitter] Scene ${subscription.sceneType}:${instanceId} unsubscribed for token ${subscription.tokenAddress}`
      );
    }
  }

  /**
   * Emit token info update event - will notify all subscribed instances for this token
   */
  emitTokenInfoUpdate(
    tokenAddress: string,
    data: TokenInfoUpdateEvent["data"]
  ): void {
    const timestamp = new Date();

    console.log(`📡 [EMITTER] Emitting token info update for ${tokenAddress}:`);
    console.log(
      `   👥 holders: ${data.holders} (type: ${typeof data.holders})`
    );
    console.log(
      `   📊 marketCap: ${data.marketCap} (type: ${typeof data.marketCap})`
    );
    console.log(
      `   📜 totalSupply: ${
        data.totalSupply
      } (type: ${typeof data.totalSupply})`
    );
    console.log(
      `   🌐 website: ${data.website} (type: ${typeof data.website})`
    );
    console.log(
      `   📱 telegramLink: ${
        data.telegramLink
      } (type: ${typeof data.telegramLink})`
    );
    console.log(
      `   🐦 twitterLink: ${
        data.twitterLink
      } (type: ${typeof data.twitterLink})`
    );

    // 🛡️ PROTECTION: Check if subscriptions map exists
    if (!this.subscriptions) {
      logger.debug(
        `[TokenInfoUpdateEmitter] Subscriptions map is null, aborting emit for token ${tokenAddress}`
      );
      return;
    }

    // Find all subscribed instances for this token
    const tokenSubscriptions = Array.from(this.subscriptions.values()).filter(
      (sub) => sub.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );

    if (tokenSubscriptions.length === 0) {
      logger.debug(
        `[TokenInfoUpdateEmitter] No subscriptions found for token ${tokenAddress}`
      );
      return;
    }

    logger.debug(
      `[TokenInfoUpdateEmitter] Emitting token info update for ${tokenAddress} to ${tokenSubscriptions.length} instances`
    );

    // Emit to each subscribed instance with safety checks
    const validSubscriptions: string[] = [];
    const expiredSubscriptions: string[] = [];

    tokenSubscriptions.forEach((subscription) => {
      try {
        // 🛡️ PROTECTION: Double-check subscription still exists
        if (!this.subscriptions.has(subscription.instanceId)) {
          logger.debug(
            `[TokenInfoUpdateEmitter] Subscription ${subscription.instanceId} expired during emission`
          );
          expiredSubscriptions.push(subscription.instanceId);
          return;
        }

        const event: TokenInfoUpdateEvent = {
          tokenAddress,
          instanceId: subscription.instanceId,
          data,
          timestamp,
        };

        console.log(
          `🎯 [EMITTER] Creating event for instance ${subscription.instanceId}:`
        );
        console.log(
          `   👥 event.data.holders: ${event.data.holders} (type: ${typeof event
            .data.holders})`
        );
        console.log(
          `   📊 event.data.marketCap: ${
            event.data.marketCap
          } (type: ${typeof event.data.marketCap})`
        );
        console.log(
          `   📜 event.data.totalSupply: ${
            event.data.totalSupply
          } (type: ${typeof event.data.totalSupply})`
        );

        // Emit instance-specific event
        this.emit(`tokenInfo:updated:${subscription.instanceId}`, event);

        validSubscriptions.push(subscription.instanceId);

        logger.debug(
          `[TokenInfoUpdateEmitter] Sent update to ${subscription.sceneType}:${subscription.instanceId}`
        );

        console.log(
          `✅ [EMITTER] Event emitted to ${subscription.sceneType}:${subscription.instanceId}`
        );
      } catch (error) {
        logger.error(
          `[TokenInfoUpdateEmitter] Error emitting to ${subscription.instanceId}: ${error}`
        );
        expiredSubscriptions.push(subscription.instanceId);
      }
    });

    // Clean up any expired subscriptions found during emission
    if (expiredSubscriptions.length > 0) {
      logger.debug(
        `[TokenInfoUpdateEmitter] Cleaning up ${expiredSubscriptions.length} expired subscriptions`
      );
      expiredSubscriptions.forEach((instanceId) => {
        this.unsubscribe(instanceId);
      });
    }

    logger.debug(
      `[TokenInfoUpdateEmitter] Successfully emitted to ${validSubscriptions.length}/${tokenSubscriptions.length} instances for token ${tokenAddress}`
    );

    // Also emit general event for backward compatibility
    const generalEvent: TokenInfoUpdateEvent = {
      tokenAddress,
      data,
      timestamp,
    };
    this.emit("tokenInfo:updated", generalEvent);
    this.emit(`tokenInfo:updated:${tokenAddress}`, generalEvent);
  }

  /**
   * Listen for token info updates for a specific scene instance
   */
  onInstanceTokenInfoUpdate(
    instanceId: string,
    callback: (event: TokenInfoUpdateEvent) => void
  ): void {
    this.on(`tokenInfo:updated:${instanceId}`, callback);
  }

  /**
   * Remove listener for a specific scene instance
   */
  removeInstanceTokenInfoListener(
    instanceId: string,
    callback: (event: TokenInfoUpdateEvent) => void
  ): void {
    this.removeListener(`tokenInfo:updated:${instanceId}`, callback);
  }

  /**
   * Remove all listeners for a specific scene instance
   */
  removeAllInstanceListeners(instanceId: string): void {
    this.removeAllListeners(`tokenInfo:updated:${instanceId}`);
  }

  /**
   * Legacy method - listen for token info updates for a specific token (backward compatibility)
   */
  onTokenInfoUpdate(
    tokenAddress: string,
    callback: (event: TokenInfoUpdateEvent) => void
  ): void {
    this.on(`tokenInfo:updated:${tokenAddress}`, callback);
  }

  /**
   * Legacy method - remove listener for a specific token
   */
  removeTokenInfoListener(
    tokenAddress: string,
    callback: (event: TokenInfoUpdateEvent) => void
  ): void {
    this.removeListener(`tokenInfo:updated:${tokenAddress}`, callback);
  }

  /**
   * Legacy method - remove all listeners for a specific token
   */
  removeAllTokenListeners(tokenAddress: string): void {
    this.removeAllListeners(`tokenInfo:updated:${tokenAddress}`);
  }

  /**
   * Get current subscription count for debugging
   */
  getSubscriptionCount(tokenAddress?: string): number {
    // 🛡️ PROTECTION: Check if subscriptions map exists
    if (!this.subscriptions) {
      return 0;
    }

    if (tokenAddress) {
      return Array.from(this.subscriptions.values()).filter(
        (sub) => sub.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
      ).length;
    }
    return this.subscriptions.size;
  }

  /**
   * Get all subscriptions for debugging
   */
  getSubscriptions(tokenAddress?: string): TokenInfoSubscription[] {
    // 🛡️ PROTECTION: Check if subscriptions map exists
    if (!this.subscriptions) {
      return [];
    }

    const allSubs = Array.from(this.subscriptions.values());
    return tokenAddress
      ? allSubs.filter(
          (sub) => sub.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
        )
      : allSubs;
  }
}

export const tokenInfoUpdateEmitter = TokenInfoUpdateEmitter.getInstance();
