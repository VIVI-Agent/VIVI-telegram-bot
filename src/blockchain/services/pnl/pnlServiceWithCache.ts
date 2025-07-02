import { formatEther, formatUnits, parseUnits } from "viem";
import { logger } from "@logger";
import { getBestDexForSellTokenToEth } from "@blockchain";
import { publicClientDRPC } from "@client";
import { PnlData } from "@domain";
import { GlobalSceneContext } from "@types";
import { pnlUpdateEmitter } from "./pnlUpdateEmitter";

export interface PnlSummary {
  token: { symbol: string; address: string; id: number; decimals: number };
  unrealizedPnlEth: string;
  realizedPnlEth: string;
  totalPnlEth: string;
  percentageReturn: string;
  averageCost: string;
  currentPrice: string;
  balance: string;
  isFromCache?: boolean;
  lastUpdated?: Date;
}

export class PnlServiceWithCache {
  constructor() {}

  /**
   * Get user PnL summary with cache-first approach
   * Returns cached data immediately, then updates in background if needed
   */
  async getUserPnlSummaryWithCache(
    ctx: GlobalSceneContext,
    userId: number
  ): Promise<{
    data: PnlSummary[];
    isFromCache: boolean;
    needsUpdate: boolean;
  }> {
    try {
      // First, try to get cached data
      const cachedData = await ctx.services.pnlCacheService.getCachedUserPnl(
        userId
      );

      if (cachedData.length > 0) {
        // Convert cached data to expected format
        const formattedData: PnlSummary[] = cachedData.map((cache) => ({
          token: cache.token,
          balance: cache.balance,
          unrealizedPnlEth: formatEther(BigInt(cache.pnl.unrealizedPnlWei)),
          realizedPnlEth: formatEther(BigInt(cache.pnl.realizedPnlWei)),
          totalPnlEth: formatEther(BigInt(cache.pnl.totalPnlWei)),
          percentageReturn: `${cache.pnl.percentageReturn}%`,
          averageCost: "0", // TODO: Calculate if needed
          currentPrice: formatEther(BigInt(cache.pnl.currentPriceWei)),
          isFromCache: true,
          lastUpdated: cache.lastUpdated,
        }));

        // Check if cache is stale (older than 30 seconds)
        const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
        const needsUpdate = cachedData.some(
          (cache) => cache.lastUpdated < thirtySecondsAgo
        );

        logger.debug(
          `[PnlServiceWithCache] Returning cached data for user ${userId}, needsUpdate: ${needsUpdate}`
        );

        return {
          data: formattedData,
          isFromCache: true,
          needsUpdate,
        };
      }

      logger.debug(
        `[PnlServiceWithCache] No cache available, calculating fresh data for user ${userId}`
      );

      // No cache available, calculate fresh data
      const freshData = await this.calculateFreshUserPnl(ctx, userId);

      // Save fresh data to cache for next time
      await this.saveFreshDataToCache(ctx, userId, freshData);

      logger.debug(
        `[PnlServiceWithCache] Fresh data calculated and saved to cache for user ${userId}`
      );

      return {
        data: freshData,
        isFromCache: false,
        needsUpdate: false,
      };
    } catch (error) {
      logger.error(
        `[PnlServiceWithCache] Error getting user PnL summary:`,
        error
      );

      // Fallback: try to get any cached data, even if stale
      try {
        const fallbackCache =
          await ctx.services.pnlCacheService.getCachedUserPnl(userId);
        if (fallbackCache.length > 0) {
          const formattedData: PnlSummary[] = fallbackCache.map((cache) => ({
            token: cache.token,
            balance: cache.balance,
            unrealizedPnlEth: formatEther(BigInt(cache.pnl.unrealizedPnlWei)),
            realizedPnlEth: formatEther(BigInt(cache.pnl.realizedPnlWei)),
            totalPnlEth: formatEther(BigInt(cache.pnl.totalPnlWei)),
            percentageReturn: `${cache.pnl.percentageReturn}%`,
            averageCost: "0",
            currentPrice: formatEther(BigInt(cache.pnl.currentPriceWei)),
            isFromCache: true,
            lastUpdated: cache.lastUpdated,
          }));

          logger.debug(
            `[PnlServiceWithCache] Returning fallback cached data for user ${userId}`
          );

          return {
            data: formattedData,
            isFromCache: true,
            needsUpdate: true,
          };
        }
      } catch (fallbackError) {
        logger.error(
          `[PnlServiceWithCache] Fallback cache failed:`,
          fallbackError
        );
      }

      return {
        data: [],
        isFromCache: false,
        needsUpdate: false,
      };
    }
  }

  /**
   * Save fresh PnL data to cache
   */
  async saveFreshDataToCache(
    ctx: GlobalSceneContext,
    userId: number,
    freshData: PnlSummary[]
  ): Promise<void> {
    try {
      logger.debug(
        `[PnlServiceWithCache] Saving fresh data to cache for user ${userId}`
      );

      // Save each token's PnL to cache
      for (const tokenPnl of freshData) {
        // Find the holding for this token
        const holding = await ctx.services.holdingService.getHoldingByTokenId(
          userId,
          tokenPnl.token.id
        );

        if (holding) {
          const pnlData: PnlData = {
            currentValueWei: parseUnits(
              (
                parseFloat(tokenPnl.unrealizedPnlEth) +
                parseFloat(tokenPnl.realizedPnlEth)
              ).toFixed(18),
              18
            ).toString(),
            currentPriceWei: parseUnits(tokenPnl.currentPrice, 18).toString(),
            costBasisWei: "0", // TODO: Calculate from holding data
            unrealizedPnlWei: parseUnits(
              tokenPnl.unrealizedPnlEth,
              18
            ).toString(),
            realizedPnlWei: parseUnits(tokenPnl.realizedPnlEth, 18).toString(),
            totalPnlWei: parseUnits(tokenPnl.totalPnlEth, 18).toString(),
            percentageReturn: tokenPnl.percentageReturn.replace("%", ""),
          };

          await ctx.services.pnlCacheService.savePnlCache(
            userId,
            holding.id,
            pnlData
          );

          logger.debug(
            `[PnlServiceWithCache] Saved cache for token ${tokenPnl.token.symbol} (${tokenPnl.token.id})`
          );
        } else {
          logger.warn(
            `[PnlServiceWithCache] No holding found for token ${tokenPnl.token.id} when saving cache`
          );
        }
      }

      logger.debug(
        `[PnlServiceWithCache] Successfully saved cache for ${freshData.length} tokens for user ${userId}`
      );
    } catch (error) {
      logger.error(
        `[PnlServiceWithCache] Error saving fresh data to cache:`,
        error
      );
    }
  }

  /**
   * Update user PnL cache in background
   */
  async updateUserPnlCacheInBackground(
    ctx: GlobalSceneContext,
    userId: number
  ): Promise<void> {
    try {
      logger.debug(
        `[PnlServiceWithCache] Starting background PnL update for user ${userId}`
      );

      const freshData = await this.calculateFreshUserPnl(ctx, userId);

      // Save each token's PnL to cache
      for (const tokenPnl of freshData) {
        // Find the holding for this token (using first holding for now)
        const holding = await ctx.services.holdingService.getHoldingByTokenId(
          userId,
          tokenPnl.token.id
        );

        if (holding) {
          const pnlData: PnlData = {
            currentValueWei: parseUnits(tokenPnl.totalPnlEth, 18).toString(), // This needs proper calculation
            currentPriceWei: parseUnits(tokenPnl.currentPrice, 18).toString(),
            costBasisWei: "0", // TODO: Calculate from holding data
            unrealizedPnlWei: parseUnits(
              tokenPnl.unrealizedPnlEth,
              18
            ).toString(),
            realizedPnlWei: parseUnits(tokenPnl.realizedPnlEth, 18).toString(),
            totalPnlWei: parseUnits(tokenPnl.totalPnlEth, 18).toString(),
            percentageReturn: tokenPnl.percentageReturn.replace("%", ""),
          };

          await ctx.services.pnlCacheService.savePnlCache(
            userId,
            holding.id,
            pnlData
          );
        }
      }

      logger.debug(
        `[PnlServiceWithCache] Background PnL update completed for user ${userId}, emitting update event`
      );

      // Check how many instances are subscribed before emitting
      const subscriptionCount = pnlUpdateEmitter.getSubscriptionCount(userId);
      const subscriptions = pnlUpdateEmitter.getSubscriptions(userId);

      logger.debug(
        `[PnlServiceWithCache] Found ${subscriptionCount} subscribed instances for user ${userId}: ${subscriptions
          .map((s) => `${s.sceneType}:${s.instanceId}`)
          .join(", ")}`
      );

      // Emit event to notify listening scenes that data has been updated
      pnlUpdateEmitter.emitPnlUpdate(userId, freshData);
    } catch (error) {
      logger.error(
        `[PnlServiceWithCache] Error updating PnL cache in background:`,
        error
      );
    }
  }

  /**
   * Calculate fresh PnL data from blockchain
   */
  async calculateFreshUserPnl(
    ctx: GlobalSceneContext,
    userId: number
  ): Promise<PnlSummary[]> {
    // Get holdings
    const holdings = await ctx.services.holdingService.getHoldingsByUserId(
      userId
    );

    // Group holdings by token for parallel processing
    const holdingsByToken = new Map<
      number,
      {
        token: {
          symbol: string;
          address: string;
          id: number;
          decimals: number;
        };
        holdings: typeof holdings;
      }
    >();

    // Organize holdings by token
    for (const holding of holdings) {
      const tokenId = holding.token.id;
      if (!holdingsByToken.has(tokenId)) {
        holdingsByToken.set(tokenId, {
          token: {
            symbol: holding.token.symbol,
            address: holding.token.address,
            id: tokenId,
            decimals: holding.token.decimals,
          },
          holdings: [],
        });
      }
      holdingsByToken.get(tokenId)!.holdings.push(holding);
    }

    // Process each token in parallel
    const tokenPnlPromises = Array.from(holdingsByToken.values()).map(
      async (tokenData) => {
        try {
          // Process first holding for each token (maintaining original behavior)
          const firstHolding = tokenData.holdings[0];
          const pnl = await this.calculateTokenPnlFresh(ctx, firstHolding.id);

          // Sum all balances for this token
          let totalBalance = BigInt(0);
          for (const holding of tokenData.holdings) {
            totalBalance += BigInt(holding.balance);
          }

          // Return in expected format
          return {
            token: tokenData.token,
            balance: formatUnits(totalBalance, tokenData.token.decimals),
            ...pnl,
            isFromCache: false,
          };
        } catch (error) {
          logger.error(
            `[PnlServiceWithCache] Error calculating PNL for token ${tokenData.token.id}:`,
            error
          );
          return null;
        }
      }
    );

    // Execute promises in parallel and filter nulls
    const results = (await Promise.all(tokenPnlPromises)).filter(
      (item): item is NonNullable<typeof item> => item !== null
    );

    return results;
  }

  /**
   * Calculate fresh PNL for a specific token holding (from blockchain)
   */
  async calculateTokenPnlFresh(
    ctx: GlobalSceneContext,
    holdingId: number
  ): Promise<{
    unrealizedPnlEth: string;
    realizedPnlEth: string;
    totalPnlEth: string;
    percentageReturn: string;
    averageCost: string;
    currentPrice: string;
  }> {
    try {
      logger.debug(
        `[PnlServiceWithCache] Starting fresh calculateTokenPnl for holding ${holdingId}`
      );

      const holding = await ctx.services.holdingService.getHoldingById(
        holdingId
      );

      if (!holding) {
        logger.error(`[PnlServiceWithCache] Holding ${holdingId} not found`);
        throw new Error(`Holding ${holdingId} not found`);
      }

      // Get current token balance and calculation variables
      const tokenBalance = BigInt(holding.balance);
      const costBasis = BigInt(holding.totalCostBasis || "0");
      const totalTokensBought = BigInt(holding.totalTokensBought || "0");
      const realizedPnl = BigInt(holding.realizedPnlWei || "0");

      // Calculate average cost
      const averageCost =
        totalTokensBought > 0n
          ? formatEther(
              (costBasis * parseUnits("1", holding.token.decimals)) /
                totalTokensBought
            )
          : "0";

      // Get current token price using existing quote mechanism
      let currentValue = 0n;
      let currentPrice = "0";

      if (tokenBalance > 0n) {
        try {
          // Use existing price quote mechanism
          const { best } = await getBestDexForSellTokenToEth({
            publicClient: publicClientDRPC,
            tokenIn: holding.token.address as `0x${string}`,
            feeTiers: [100, 500, 3000, 10000],
            amountTokenIn: tokenBalance,
          });

          if (best) {
            currentValue = BigInt(best.amountOut || "0");
            currentPrice = formatEther(
              (currentValue * parseUnits("1", holding.token.decimals)) /
                tokenBalance
            );
          }
        } catch (error) {
          logger.error(
            `[PnlServiceWithCache] Error getting price quote for holding ${holdingId}:`,
            error
          );
        }
      }

      // Calculate unrealized PNL
      const unrealizedPnl = currentValue - costBasis;

      // Calculate total PNL (realized + unrealized)
      const totalPnl = realizedPnl + unrealizedPnl;

      // Calculate percentage return
      const percentageReturn =
        costBasis > 0n
          ? ((Number(totalPnl) / Number(costBasis)) * 100).toFixed(2)
          : "0";

      return {
        unrealizedPnlEth: formatEther(unrealizedPnl),
        realizedPnlEth: formatEther(realizedPnl),
        totalPnlEth: formatEther(totalPnl),
        percentageReturn: `${percentageReturn}%`,
        averageCost,
        currentPrice,
      };
    } catch (error) {
      logger.error(
        `[PnlServiceWithCache] Error in calculateTokenPnlFresh for holding ${holdingId}:`,
        error
      );
      throw error;
    }
  }
}
