import { PnlServiceWithCache } from "blockchain/services/pnl/pnlServiceWithCache";
import { BaseService, GlobalSceneContext } from "../../types";

export class PositionsService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "PositionsService");
  }

  /**
   * Load user positions with cache-first approach
   */
  async loadUserPnl(ctx: GlobalSceneContext) {
    try {
      this.log("info", ctx, `Loading positions for user: ${ctx.user.id}`);

      const pnlService = new PnlServiceWithCache();

      const pnlResult = await pnlService.getUserPnlSummaryWithCache(
        ctx,
        ctx.user.id
      );

      // If we got cached data but it needs update, trigger background refresh
      if (pnlResult.isFromCache && pnlResult.needsUpdate) {
        this.log("info", ctx, "Cache is stale, triggering background update");
        // Fire and forget - update in background
        this.updateCacheInBackground(ctx, pnlService).catch((error) => {
          this.log("error", ctx, `Background cache update failed: ${error}`);
        });
      }

      this.log(
        "info",
        ctx,
        `Positions loaded: ${pnlResult.data.length} tokens, fromCache: ${pnlResult.isFromCache}`
      );

      return pnlResult;
    } catch (error) {
      this.log("error", ctx, `Error loading positions: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh positions data (force fresh calculation)
   */
  async refreshPositions(ctx: GlobalSceneContext) {
    try {
      this.log(
        "info",
        ctx,
        `Force refreshing positions for user: ${ctx.user.id}`
      );

      const pnlService = new PnlServiceWithCache();

      // For refresh, we want to always get fresh data and update cache
      const freshData = await pnlService.calculateFreshUserPnl(
        ctx,
        ctx.user.id
      );

      // Save to cache
      await pnlService.saveFreshDataToCache(ctx, ctx.user.id, freshData);

      this.log("info", ctx, `Positions refreshed: ${freshData.length} tokens`);

      return {
        data: freshData,
        isFromCache: false,
        needsUpdate: false,
      };
    } catch (error) {
      this.log("error", ctx, `Error refreshing positions: ${error}`);
      throw error;
    }
  }

  /**
   * Update cache in background without blocking UI
   */
  private async updateCacheInBackground(
    ctx: GlobalSceneContext,
    pnlService: PnlServiceWithCache
  ): Promise<void> {
    try {
      this.log("debug", ctx, "Starting background cache update");

      await pnlService.updateUserPnlCacheInBackground(ctx, ctx.user.id);

      this.log("debug", ctx, "Background cache update completed");
    } catch (error) {
      this.log("error", ctx, `Background cache update error: ${error}`);
      // Don't throw - this is background operation
    }
  }
}
