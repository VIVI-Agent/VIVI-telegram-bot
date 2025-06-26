import { BaseService, GlobalSceneContext, InitUserSceneData } from "@types";
import { createBaseWallet } from "@services";

/**
 * InitUser business logic services
 */
export class InitUserServices extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "InitUserServices");
  }

  /**
   * Creates a new wallet for the user
   */
  public async createWallet(ctx: GlobalSceneContext): Promise<{
    address: `0x${string}`;
    encryptedPrivKey: string;
    privateKey: string;
  }> {
    this.log("info", ctx, "Creating wallet");

    try {
      const { address, encryptedPrivKey, privateKey } =
        await createBaseWallet();

      await ctx.services.walletService.createUserWallet(
        ctx.user.id,
        address,
        encryptedPrivKey,
        true
      );

      this.log("info", ctx, `Wallet created successfully: ${address}`);

      return {
        address,
        encryptedPrivKey,
        privateKey,
      };
    } catch (error) {
      this.logError(ctx, "createWallet", error);
      throw error;
    }
  }

  /**
   * Handles the completion of InitUser flow and transition to MainMenu
   */
  public async completeInitUser(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Completing InitUser flow");

    try {
      this.log("info", ctx, "InitUser completed, transitioning to MainMenu");

      // Deactivate this scene (cleanup)
      await ctx.sceneManager.deactivateScene(ctx, this.instanceId);

      // Activate MainMenu scene
      await ctx.sceneManager.activateScene(ctx, "MainMenu");
    } catch (error) {
      this.logError(ctx, "completeInitUser", error);
      throw error;
    }
  }
}
