import { decryptPrivateKey } from "@services";
import { BaseSubScene, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { WalletsMenus } from "./WalletsMenus";
import { WalletsService } from "./WalletsService";
import { CB } from "./callbacks";
import { WALLET_TEXTS } from "./messages";
import { Address, privateKeyToAccount } from "viem/accounts";

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
          this.resetImportingPrivateKey(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;
        // Wallets Root
        case CB.WALLETS_ROOT:
          await ctx.answerCbQuery();
          this.resetImportingPrivateKey(ctx);
          await this.menus.showWalletsMenu(ctx, sceneData, messageId);
          return true;
        // Dismiss settingsaaasd
        case CB.DISMISS_WALLETS:
          await ctx.answerCbQuery();
          this.resetImportingPrivateKey(ctx);
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

          if (!reloadedUser) {
            this.log("error", ctx, "User not found");
            return false;
          }

          sceneData.user = reloadedUser;
          this.updateSceneData(ctx, sceneData);
          const reachedMaxWallets =
            reloadedUser?.wallets?.length && reloadedUser.wallets.length >= 5;
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

        // Remove Wallet List
        case CB.REMOVE_WALLET:
          await ctx.answerCbQuery();
          await this.menus.showRemoveWalletMenu(ctx, sceneData, messageId);
          return true;

        // Remove Wallet Confirm
        case CB.REMOVE_WALLET_CONFIRM:
          await ctx.answerCbQuery();
          const walletIdToConfirm = params[0];

          const walletToConfirm = await this.service.getWalletById(
            ctx,
            Number(walletIdToConfirm)
          );

          if (!walletToConfirm) {
            this.log("error", ctx, "Wallet not found");
            ctx.reply(WALLET_TEXTS.ERRORS.WALLET_NOT_FOUND);
            return false;
          }

          await this.menus.showRemoveConfirmationMenu(
            ctx,
            Number(walletIdToConfirm),
            walletToConfirm.address,
            walletToConfirm.balance,
            messageId
          );
          return true;

        // Remove Wallet Select
        case CB.REMOVE_WALLET_SELECT:
          await ctx.answerCbQuery();
          const walletIdToRemove = params[0];
          await this.service.softDeleteWallet(ctx, walletIdToRemove);

          const updatedUser = await this.service.loadUserData(ctx, ctx.user.id);
          if (updatedUser) {
            sceneData.user = updatedUser;
            this.updateSceneData(ctx, sceneData);
            await this.menus.showRemoveWalletMenu(ctx, sceneData, messageId);
          }

          return true;

        // Export Wallet
        case CB.EXPORT_WALLET:
          await ctx.answerCbQuery();
          await this.menus.showExportWalletMenu(ctx, sceneData, messageId);
          return true;

        // Export Wallet Select
        case CB.EXPORT_WALLET_SELECT:
          await ctx.answerCbQuery();
          const walletIdToExport = params[0];
          const walletToExport = await this.service.getWalletById(
            ctx,
            Number(walletIdToExport)
          );

          if (!walletToExport) {
            this.log("error", ctx, "Wallet not found");
            ctx.reply(WALLET_TEXTS.ERRORS.WALLET_NOT_FOUND);
            return false;
          }

          const privateKeyToExport = decryptPrivateKey(
            walletToExport.encryptedPrivKey
          );

          await this.menus.showExportWalletDataMenu(
            ctx,
            walletToExport.address,
            privateKeyToExport,
            messageId
          );
          return true;

        // Import Wallet
        case CB.IMPORT_WALLET:
          await ctx.answerCbQuery();
          const wallets = sceneData.user?.wallets;
          if (wallets && wallets.length >= 5) {
            await this.menus.showMaxWalletsReached(ctx);
            return true;
          }

          sceneData.importingPrivateKey = true;
          this.updateSceneData(ctx, sceneData);

          await this.menus.showImportWalletMenu(ctx, messageId);
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
    const sceneData = this.getSceneData(ctx);
    const messageId = sceneData.menuMessageId;

    if (sceneData.importingPrivateKey) {
      sceneData.privateKeyMessageId = ctx.message?.message_id;
      this.updateSceneData(ctx, sceneData);

      // Validate private key format
      let formattedPK = text.trim();
      if (!formattedPK.startsWith("0x")) {
        formattedPK = `0x${formattedPK}`;
      }

      // Validate private key
      let address: Address;
      try {
        const account = privateKeyToAccount(formattedPK as `0x${string}`);
        address = account.address;

        const result = await this.service.importWallet(
          ctx,
          sceneData,
          address,
          formattedPK
        );

        await ctx.deleteMessage(sceneData.privateKeyMessageId);

        if (result?.wallet) {
          this.resetImportingPrivateKey(ctx);

          await ctx.reply(
            WALLET_TEXTS.FUNCTIONS.getSuccessImportWalletMsg(address),
            { parse_mode: "HTML" }
          );

          await this.menus.showWalletsMenu(ctx, sceneData, messageId);
        } else if (result?.deleted) {
          await this.menus.showInvalidPrivateKeyMenu(
            ctx,
            WALLET_TEXTS.ERRORS.CANT_IMPORT_DELETED_WALLET,
            messageId
          );
        } else if (result?.existing) {
          await this.menus.showInvalidPrivateKeyMenu(
            ctx,
            WALLET_TEXTS.ERRORS.CANT_IMPORT_EXISTING_WALLET,
            messageId
          );
        } else if (result?.invalid) {
          await this.menus.showInvalidPrivateKeyMenu(
            ctx,
            WALLET_TEXTS.ERRORS.INVALID_PRIVATE_KEY,
            messageId
          );
        } else {
          await this.menus.showInvalidPrivateKeyMenu(
            ctx,
            WALLET_TEXTS.ERRORS.INVALID_PRIVATE_KEY,
            messageId
          );
        }
        return true;
      } catch (error) {
        this.log("error", ctx, `Invalid private key format: ${error}`);
        sceneData.importingPrivateKey = false;
        this.updateSceneData(ctx, sceneData);
        await ctx.deleteMessage(sceneData.privateKeyMessageId);
        await this.menus.showInvalidPrivateKeyMenu(
          ctx,
          WALLET_TEXTS.ERRORS.INVALID_PRIVATE_KEY,
          messageId
        );
        return true;
      }
    }

    return false;
  }

  private resetImportingPrivateKey(ctx: GlobalSceneContext): void {
    const sceneData = this.getSceneData(ctx);
    sceneData.importingPrivateKey = false;
    this.updateSceneData(ctx, sceneData);
  }
}
