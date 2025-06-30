import { PnlServiceWithCache } from "blockchain/services/pnl/pnlServiceWithCache";
import { BaseService, GlobalSceneContext } from "../../types";

export class PositionsService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "PositionsService");
  }

  /**
   * Load user positions
   */
  async loadUserPnl(ctx: GlobalSceneContext) {
    try {
      this.log("info", ctx, `Loading positions for user: ${ctx.user.id}`);

      // Load user with wallets and holdings
      const pnlService = new PnlServiceWithCache();

      const pnlResult = await pnlService.getUserPnlSummaryWithCache(
        ctx,
        ctx.user.id
      );

      return pnlResult;
    } catch (error) {
      this.log("error", ctx, `Error loading positions: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh positions data
   */
  async refreshPositions(ctx: GlobalSceneContext) {
    try {
      this.log("info", ctx, `Refreshing positions for user: ${ctx.user.id}`);

      // TODO: Implement positions refresh logic
      return await this.loadUserPnl(ctx);
    } catch (error) {
      this.log("error", ctx, `Error refreshing positions: ${error}`);
      throw error;
    }
  }
}
