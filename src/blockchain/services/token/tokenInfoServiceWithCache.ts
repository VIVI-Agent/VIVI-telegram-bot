import { Address } from "viem";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { getTokenExternalInfo } from "./getTokenExternalInfo";
import { tokenInfoUpdateEmitter } from "./tokenInfoUpdateEmitter";
import { findOrCreateToken } from "./findOrCreateToken";
import { Decimal } from "@prisma/client/runtime/library";

export interface TokenInfoSummary {
  tokenAddress: string;
  marketCap?: string;
  totalSupply?: string;
  holders?: string;
  website?: string;
  telegramLink?: string;
  twitterLink?: string;
  isFromCache?: boolean;
  lastUpdated?: Date;
}

export class TokenInfoServiceWithCache {
  constructor() {}

  /**
   * Get token info with cache-first approach
   * Returns cached data immediately, then updates in background if needed
   */
  async getTokenInfoWithCache(
    ctx: GlobalSceneContext,
    tokenAddress: Address
  ): Promise<{
    data: TokenInfoSummary | null;
    isFromCache: boolean;
    needsUpdate: boolean;
  }> {
    try {
      // First, try to get cached data from database
      const token = await ctx.services.tokenService.getTokenByAddress(
        tokenAddress
      );
      if (!token) {
        logger.debug(
          `[TokenInfoServiceWithCache] Token not found for address ${tokenAddress}`
        );

        // No token found, trigger fresh calculation
        const freshData = await this.calculateFreshTokenInfo(ctx, tokenAddress);
        return {
          data: freshData,
          isFromCache: false,
          needsUpdate: false,
        };
      }

      const cachedInfo =
        await ctx.services.externalTokenInfoService.getExternalTokenInfo(
          token.id
        );

      if (cachedInfo) {
        // Convert cached data to expected format
        const formattedData: TokenInfoSummary = {
          tokenAddress: tokenAddress.toLowerCase(),
          marketCap: cachedInfo.marketCapUsd?.toString(),
          totalSupply: cachedInfo.totalSupply || undefined,
          holders: cachedInfo.totalHolders?.toString(),
          website: cachedInfo.website || undefined,
          telegramLink: cachedInfo.telegramLink || undefined,
          twitterLink: cachedInfo.twitterLink || undefined,
          isFromCache: true,
          lastUpdated: cachedInfo.updatedAt,
        };

        // Check if cache is stale (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const needsUpdate = cachedInfo.updatedAt < oneHourAgo;

        logger.debug(
          `[TokenInfoServiceWithCache] Cache check for token ${tokenAddress}:`
        );
        logger.debug(`  - Current time: ${new Date().toISOString()}`);
        logger.debug(`  - One hour ago: ${oneHourAgo.toISOString()}`);
        logger.debug(
          `  - Cache updated at: ${cachedInfo.updatedAt.toISOString()}`
        );
        logger.debug(`  - needsUpdate: ${needsUpdate}`);

        logger.debug(
          `[TokenInfoServiceWithCache] Returning cached data for token ${tokenAddress}, needsUpdate: ${needsUpdate}`
        );

        console.log(
          `📤 [TOKEN CACHE] Returning cached data for ${tokenAddress}:`
        );
        console.log(`   👥 Cached Holders: ${formattedData.holders}`);
        console.log(`   📊 Cached Market Cap: ${formattedData.marketCap}`);
        console.log(`   📜 Cached Total Supply: ${formattedData.totalSupply}`);
        console.log(
          `   🕒 Last Updated: ${formattedData.lastUpdated?.toISOString()}`
        );
        console.log(`   🔄 Needs Update: ${needsUpdate}`);

        return {
          data: formattedData,
          isFromCache: true,
          needsUpdate,
        };
      }

      logger.debug(
        `[TokenInfoServiceWithCache] No cache available, calculating fresh data for token ${tokenAddress}`
      );

      // No cache available, calculate fresh data
      const freshData = await this.calculateFreshTokenInfo(ctx, tokenAddress);

      return {
        data: freshData,
        isFromCache: false,
        needsUpdate: false,
      };
    } catch (error) {
      logger.error(
        `[TokenInfoServiceWithCache] Error getting token info:`,
        error
      );

      // Fallback: try to get any cached data, even if stale
      try {
        const token = await ctx.services.tokenService.getTokenByAddress(
          tokenAddress
        );
        if (token) {
          const fallbackCache =
            await ctx.services.externalTokenInfoService.getExternalTokenInfo(
              token.id
            );
          if (fallbackCache) {
            const formattedData: TokenInfoSummary = {
              tokenAddress: tokenAddress.toLowerCase(),
              marketCap: fallbackCache.marketCapUsd?.toString(),
              totalSupply: fallbackCache.totalSupply || undefined,
              holders: fallbackCache.totalHolders?.toString(),
              website: fallbackCache.website || undefined,
              telegramLink: fallbackCache.telegramLink || undefined,
              twitterLink: fallbackCache.twitterLink || undefined,
              isFromCache: true,
              lastUpdated: fallbackCache.updatedAt,
            };

            return {
              data: formattedData,
              isFromCache: true,
              needsUpdate: true,
            };
          }
        }
      } catch (fallbackError) {
        logger.error(
          `[TokenInfoServiceWithCache] Fallback cache failed:`,
          fallbackError
        );
      }

      return {
        data: null,
        isFromCache: false,
        needsUpdate: false,
      };
    }
  }

  /**
   * Update token info cache in background
   */
  async updateTokenInfoCacheInBackground(
    ctx: GlobalSceneContext,
    tokenAddress: Address
  ): Promise<void> {
    try {
      logger.info(
        `[TokenInfoServiceWithCache] 🚀 Starting background token info update for ${tokenAddress}`
      );

      const freshData = await this.calculateFreshTokenInfo(ctx, tokenAddress);

      if (freshData) {
        logger.info(
          `[TokenInfoServiceWithCache] ✅ Fresh token info calculated for ${tokenAddress}: marketCap=${freshData.marketCap}, holders=${freshData.holders}`
        );

        // Save to database
        await this.saveFreshDataToCache(ctx, tokenAddress, freshData);

        logger.info(
          `[TokenInfoServiceWithCache] 💾 Token info saved to database for ${tokenAddress}`
        );

        // Check how many instances are subscribed before emitting
        const subscriptionCount =
          tokenInfoUpdateEmitter.getSubscriptionCount(tokenAddress);
        const subscriptions =
          tokenInfoUpdateEmitter.getSubscriptions(tokenAddress);

        logger.info(
          `[TokenInfoServiceWithCache] 🎯 Found ${subscriptionCount} subscribed instances for token ${tokenAddress}: ${subscriptions
            .map((s) => `${s.sceneType}:${s.instanceId}`)
            .join(", ")}`
        );

        if (subscriptionCount > 0) {
          // Emit event to notify listening scenes that data has been updated
          logger.info(
            `[TokenInfoServiceWithCache] 📡 Emitting token info update event for ${tokenAddress}`
          );

          const eventData = {
            marketCap: freshData.marketCap,
            totalSupply: freshData.totalSupply,
            holders: freshData.holders,
            website: freshData.website,
            telegramLink: freshData.telegramLink,
            twitterLink: freshData.twitterLink,
          };

          console.log(
            `🚨 [EVENT EMITTER] About to emit data for ${tokenAddress}:`
          );
          console.log(
            `   👥 holders: ${
              eventData.holders
            } (type: ${typeof eventData.holders})`
          );
          console.log(
            `   📊 marketCap: ${
              eventData.marketCap
            } (type: ${typeof eventData.marketCap})`
          );
          console.log(
            `   📜 totalSupply: ${
              eventData.totalSupply
            } (type: ${typeof eventData.totalSupply})`
          );
          console.log(
            `   🌐 website: ${
              eventData.website
            } (type: ${typeof eventData.website})`
          );
          console.log(
            `   📱 telegramLink: ${
              eventData.telegramLink
            } (type: ${typeof eventData.telegramLink})`
          );
          console.log(
            `   🐦 twitterLink: ${
              eventData.twitterLink
            } (type: ${typeof eventData.twitterLink})`
          );

          tokenInfoUpdateEmitter.emitTokenInfoUpdate(tokenAddress, eventData);

          logger.info(
            `[TokenInfoServiceWithCache] ✨ Token info update event emitted for ${tokenAddress}`
          );
        } else {
          logger.debug(
            `[TokenInfoServiceWithCache] No subscriptions found, skipping event emission for ${tokenAddress}`
          );
        }
      } else {
        logger.warn(
          `[TokenInfoServiceWithCache] ❌ Could not calculate fresh token info for ${tokenAddress}`
        );
      }
    } catch (error) {
      logger.error(
        `[TokenInfoServiceWithCache] 💥 Error updating token info cache in background for ${tokenAddress}:`,
        error
      );
    }
  }

  /**
   * Calculate fresh token info from external sources
   */
  async calculateFreshTokenInfo(
    ctx: GlobalSceneContext,
    tokenAddress: Address
  ): Promise<TokenInfoSummary | null> {
    try {
      logger.info(
        `[TokenInfoServiceWithCache] 🔍 Starting fresh token info calculation for ${tokenAddress}`
      );

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout after 30 seconds")), 30000);
      });

      console.log(
        `🏁 [TOKEN CACHE] About to call getTokenExternalInfo for ${tokenAddress}`
      );

      const tokenInfo = await Promise.race([
        getTokenExternalInfo(ctx, tokenAddress),
        timeoutPromise,
      ]);

      if (!tokenInfo) {
        logger.warn(
          `[TokenInfoServiceWithCache] ❌ getTokenExternalInfo returned null for ${tokenAddress}`
        );
        console.log(
          `❌ [TOKEN CACHE] getTokenExternalInfo returned NULL for ${tokenAddress}`
        );
        return null;
      }

      logger.info(
        `[TokenInfoServiceWithCache] 📊 Successfully got token info for ${tokenAddress}: marketCap=${tokenInfo.marketCap?.toString()}, holders=${
          tokenInfo.holders
        }`
      );

      console.log(
        `📊 [TOKEN CACHE] Raw token info result for ${tokenAddress}:`
      );
      console.log(`   👥 Holders: ${tokenInfo.holders}`);
      console.log(`   📊 Market Cap: ${tokenInfo.marketCap?.toString()}`);
      console.log(`   📜 Total Supply: ${tokenInfo.totalSupply}`);

      const result: TokenInfoSummary = {
        tokenAddress: tokenAddress.toLowerCase(),
        marketCap: tokenInfo.marketCap?.toString(),
        totalSupply: tokenInfo.totalSupply,
        holders: tokenInfo.holders,
        website: tokenInfo.website,
        telegramLink: tokenInfo.telegramLink,
        twitterLink: tokenInfo.twitterLink,
        isFromCache: false,
      };

      return result;
    } catch (error) {
      logger.error(
        `[TokenInfoServiceWithCache] 💥 Error in calculateFreshTokenInfo for ${tokenAddress}:`,
        error
      );
      return null;
    }
  }

  /**
   * Save fresh token info data to cache
   */
  async saveFreshDataToCache(
    ctx: GlobalSceneContext,
    tokenAddress: Address,
    freshData: TokenInfoSummary
  ): Promise<void> {
    try {
      logger.debug(
        `[TokenInfoServiceWithCache] Saving fresh token info to cache for ${tokenAddress}`
      );

      // Find or create the token
      const token = await findOrCreateToken(ctx, tokenAddress);

      if (!token) {
        logger.error(
          `[TokenInfoServiceWithCache] Could not find or create token for ${tokenAddress}`
        );
        return;
      }

      console.log(
        `💾 [TOKEN CACHE] About to save to database for ${tokenAddress}:`
      );
      console.log(`   👥 Holders: ${freshData.holders}`);
      console.log(`   📊 Market Cap: ${freshData.marketCap}`);
      console.log(`   📜 Total Supply: ${freshData.totalSupply}`);

      // Update external token info
      await ctx.services.externalTokenInfoService.updateExternalTokenInfo(
        token.id,
        freshData.marketCap
          ? new (require("@prisma/client/runtime/library").Decimal)(
              freshData.marketCap
            )
          : undefined,
        freshData.totalSupply,
        freshData.holders,
        freshData.website,
        freshData.telegramLink,
        freshData.twitterLink
      );

      logger.debug(
        `[TokenInfoServiceWithCache] Successfully saved cache for token ${tokenAddress}`
      );

      console.log(
        `✅ [TOKEN CACHE] Successfully saved to database for ${tokenAddress}`
      );
    } catch (error) {
      logger.error(
        `[TokenInfoServiceWithCache] Error saving fresh token info to cache:`,
        error
      );
    }
  }

  /**
   * Mark token cache as stale (useful when new data is available)
   */
  async invalidateTokenCache(
    ctx: GlobalSceneContext,
    tokenAddress: Address
  ): Promise<void> {
    // Note: We could implement cache invalidation if needed
    logger.debug(
      `[TokenInfoServiceWithCache] Token cache invalidation requested for ${tokenAddress}`
    );
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(ctx: GlobalSceneContext, tokenAddress?: Address) {
    if (tokenAddress) {
      const subscriptionCount =
        tokenInfoUpdateEmitter.getSubscriptionCount(tokenAddress);
      const subscriptions =
        tokenInfoUpdateEmitter.getSubscriptions(tokenAddress);
      return {
        subscriptionCount,
        subscriptions,
      };
    }

    return {
      totalSubscriptions: tokenInfoUpdateEmitter.getSubscriptionCount(),
      allSubscriptions: tokenInfoUpdateEmitter.getSubscriptions(),
    };
  }
}
