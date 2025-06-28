import { UserWithWallets } from "@domain";
import { BaseService, GlobalSceneContext } from "../../types";
import { Wallet } from "@prisma/client";

export class WalletsService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "WalletsService");
  }

  async loadUserData(
    ctx: GlobalSceneContext,
    userId: number
  ): Promise<UserWithWallets | null> {
    this.log("info", ctx, "Loading user data");

    try {
      if (ctx.user.id) {
        const wallets = await ctx.services.userService.getUserWithWallets(
          userId
        );
        return wallets;
      }
    } catch (error) {
      this.logError(ctx, "loadUserData", error);
      throw error;
    }
    return null;
  }

  async navigateToMainMenu(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Main Menu");

    // This will be handled by the SubScene to activate MainMenu
    // The service just logs the action
  }
}
