import { BaseService, GlobalSceneContext } from "../../types";
export class ReferralService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "ReferralService");
  }

  /**
   * Load user data with referral information
   */
  async loadUserWithReferralData(ctx: GlobalSceneContext) {
    try {
      this.log("info", ctx, `Loading user data for referral: ${ctx.user.id}`);

      // TODO: Implement user loading with referral data
      const user = await ctx.services.userService.getUserWithReferralInfo(
        ctx.user.id
      );

      return user;
    } catch (error) {
      this.log("error", ctx, `Error loading user data: ${error}`);
      throw error;
    }
  }
}
