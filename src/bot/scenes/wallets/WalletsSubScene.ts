import { BaseSubScene, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { WalletsMenus } from "./WalletsMenus";
import { WalletsService } from "./WalletsService";
import { CB } from "./callbacks";

export class WalletsSubScene extends BaseSubScene<WalletsSceneData> {
  private menus: WalletsMenus;
  private service: WalletsService;

  constructor(instanceId: string) {
    super(instanceId, "WalletsSubScene");
    this.menus = new WalletsMenus(instanceId);
    this.service = new WalletsService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Wallets scene");

    // Initialize scene data
    const sceneData: WalletsSceneData = {
      userId: ctx.from?.id || 0,
      username: ctx.from?.username || "",
      menuMessageId: undefined,
    };

    const user = await this.service.loadUserData(ctx, ctx.user.id);

    if (user) {
      sceneData.user = user;
      this.updateSceneData(ctx, sceneData);

      const menuMessageId = await this.menus.showWalletsMenu(ctx, sceneData);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
    }
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    const validationResult = this.validateCallbackInstanceId(callback);
    if (!validationResult) {
      this.log("debug", ctx, "InstanceId mismatch, skipping");
      return false;
    }

    const { action, params } = validationResult;
    this.log("info", ctx, `Processing action: ${action}`);

    const sceneData = this.getSceneData(ctx);
    const messageId = sceneData.menuMessageId;
    try {
      switch (action) {
        // Main Menu
        case CB.MAIN_MENU:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;
        // Wallets Root
        case CB.WALLETS_ROOT:
          await ctx.answerCbQuery();
          await this.menus.showWalletsMenu(ctx, sceneData, messageId);
          return true;
        // Dismiss settingsaaasd
        case CB.DISMISS_WALLETS:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;

        // List Wallets
        case CB.LIST_WALLETS:
          await ctx.answerCbQuery();
          await this.menus.showListWalletsMenu(ctx, sceneData, messageId);
          return true;

        // Select Wallet
        case CB.SELECT_WALLET:
          await ctx.answerCbQuery();
          const walletId = params[0];

          await this.service.selectWallet(ctx, walletId);
          const user = await this.service.loadUserData(ctx, ctx.user.id);

          if (user) {
            sceneData.user = user;
            this.updateSceneData(ctx, sceneData);
            await this.menus.showListWalletsMenu(ctx, sceneData, messageId);
          }
          return true;

        // Create Wallet
        case CB.CREATE_WALLET:
          await ctx.answerCbQuery();
          let reloadedUser = await this.service.loadUserData(ctx, ctx.user.id);

          if (reloadedUser) {
            sceneData.user = reloadedUser;
            this.updateSceneData(ctx, sceneData);
          }

          const reachedMaxWallets = reloadedUser?.wallets.length === 7;
          if (reachedMaxWallets) {
            await this.menus.showMaxWalletsReached(ctx);
            return true;
          }

          const { address, privateKey } = await this.service.createWallet(
            ctx,
            sceneData
          );

          reloadedUser = await this.service.loadUserData(ctx, ctx.user.id);

          if (reloadedUser) {
            sceneData.user = reloadedUser;
            this.updateSceneData(ctx, sceneData);
            await this.menus.showCreateWalletMenu(
              ctx,
              sceneData,
              address,
              privateKey,
              messageId
            );
          }

          return true;

        // Saved Private Key
        case CB.SAVED_PRIVATE_KEY:
          await ctx.answerCbQuery();
          await this.menus.showWalletsMenu(ctx, sceneData, messageId);
          return true;

        default:
          this.log("warn", ctx, `Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error in handleCallback: ${
          error instanceof Error ? error.message : error
        }`
      );
      return false;
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `Handling text: ${text}`);
    // Basic implementation
    return false;
  }
}
