import { UserWithWallets } from "@domain";
import {
  BaseService,
  GlobalSceneContext,
  SceneData,
  WalletsSceneData,
} from "../../types";
import { Wallet } from "@prisma/client";
import { createBaseWallet } from "@services";

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
        return await ctx.services.userService.getUserWithWallets(userId);
      }
    } catch (error) {
      this.logError(ctx, "loadUserData", error);
      throw error;
    }
    return null;
  }

  async selectWallet(
    ctx: GlobalSceneContext,
    walletId: string
  ): Promise<Wallet> {
    this.log("info", ctx, "Selecting wallet");
    try {
      return await ctx.services.walletService.selectWallet(
        ctx.user.id,
        Number(walletId)
      );
    } catch (error) {
      this.logError(ctx, "selectWallet", error);
      throw error;
    }
  }

  async createWallet(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData
  ): Promise<{ address: string; privateKey: string }> {
    try {
      const { address, encryptedPrivKey, privateKey } =
        await createBaseWallet();

      await ctx.services.walletService.createUserWallet(
        sceneData.user!.id!,
        address,
        encryptedPrivKey,
        false
      );
      return {
        address,
        privateKey,
      };
    } catch (error) {
      this.logError(ctx, "createWallet", error);
      throw error;
    }
  }
}
