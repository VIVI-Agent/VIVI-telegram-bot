import { BaseService, GlobalSceneContext } from "../../types";
import { AddressValidator } from "../../../utils/inputValidators";

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

  /**
   * Set reward wallet for user
   */
  async setRewardWallet(ctx: GlobalSceneContext, walletAddress: string) {
    try {
      this.log("info", ctx, `Setting reward wallet: ${walletAddress}`);

      // Validate wallet address
      const parsedAddress =
        AddressValidator.parseEthereumAddress(walletAddress);
      if (!parsedAddress) {
        throw new Error("Invalid wallet address format");
      }

      // Update user's reward wallet
      await ctx.services.userService.updateRewardWallet(
        ctx.user.id,
        walletAddress
      );

      this.log("info", ctx, `Reward wallet updated successfully`);
      return true;
    } catch (error) {
      this.log("error", ctx, `Error setting reward wallet: ${error}`);
      throw error;
    }
  }
}
