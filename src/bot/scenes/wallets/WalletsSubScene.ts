import { decryptPrivateKey } from "@services";
import { BaseSubScene, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { WalletsMenus } from "./WalletsMenus";
import { WalletsService } from "./WalletsService";
import { CB } from "./callbacks";
import { WALLET_TEXTS } from "./messages";
import { Address, privateKeyToAccount } from "viem/accounts";
import { AddressValidator } from "@utils";
import { SendAmountValidator } from "utils/inputValidators/SendAmountValidator";

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
          this.resetSceneData(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;
        // Wallets Root
        case CB.WALLETS_ROOT:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await this.menus.showWalletsMenu(ctx, sceneData, messageId);
          return true;
        // Dismiss settingsaaasd
        case CB.DISMISS_WALLETS:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
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

        // Transfers
        // Transfers
        // Transfers
        // Transfers
        case CB.TRANSFERS:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await this.menus.showTransfersMenu(ctx, sceneData, messageId);
          return true;

        // Transfers Select Wallet
        case CB.TRANSFERS_SELECT_WALLET:
          await ctx.answerCbQuery();
          const transferWalletId = params[0];
          const transferWallet = await this.service.getWalletWithHoldings(
            ctx,
            Number(transferWalletId)
          );

          sceneData.transferMode = {
            step: "select_token",
            walletId: Number(transferWalletId),
          };
          this.updateSceneData(ctx, sceneData);

          if (!transferWallet) {
            this.log("error", ctx, "Wallet not found");
            ctx.reply(WALLET_TEXTS.ERRORS.WALLET_NOT_FOUND);
            return false;
          }

          await this.menus.showWalletTransferMenu(
            ctx,
            transferWallet,
            messageId
          );
          return true;

        // Transfers Select Token
        case CB.TRANSFERS_SELECT_TOKEN:
          await ctx.answerCbQuery();
          const transferTokenId = params[0];
          const selectTokenWalletId = sceneData.transferMode?.walletId;

          const selectTokenWallet = await this.service.getWalletWithHoldings(
            ctx,
            selectTokenWalletId!
          );

          // ETH TRANSFER DETECTION
          if (transferTokenId === "ETH") {
            this.updateTransferMode(ctx, {
              step: "select_amount",
              tokenId: transferTokenId,
              amount: undefined,
              recipient: undefined,
            });

            await this.menus.showTransferETHAmountMenu(
              ctx,
              selectTokenWallet!,
              messageId
            );
            return true;
          }

          // TOKEN TRANSFER DETECTION
          const transferToken = await this.service.getTokenById(
            ctx,
            Number(transferTokenId)
          );

          if (transferToken) {
            this.updateTransferMode(ctx, {
              step: "select_amount",
              tokenId: Number(transferTokenId),
              amount: undefined,
              recipient: undefined,
            });

            await this.menus.showTransferAmountMenu(
              ctx,
              transferToken,
              selectTokenWallet!,
              messageId
            );
            return true;
          }
          return false;

        // Transfers Select Amount
        case CB.TRANSFERS_SELECT_AMOUNT:
          await ctx.answerCbQuery();
          const amount = params[0];

          this.updateTransferMode(ctx, {
            amount: amount,
            customAmount: undefined,
            step: "enter_recipient",
          });

          const selectAmountSceneData = this.getSceneData(ctx);
          await this.menus.showTransferRecipientMenu(
            ctx,
            selectAmountSceneData,
            messageId
          );
          return true;

        // Transfers Enter Amount
        case CB.TRANSFERS_ENTER_AMOUNT:
          await ctx.answerCbQuery();
          this.updateTransferMode(ctx, {
            step: "enter_amount",
          });

          const enterAmountSceneData = this.getSceneData(ctx);
          const enterAmountWalletId =
            enterAmountSceneData.transferMode?.walletId;

          const enterAmountWallet = await this.service.getWalletWithHoldings(
            ctx,
            enterAmountWalletId!
          );

          await this.menus.showTransferCustomAmountMenu(
            ctx,
            enterAmountWallet!,
            messageId
          );
          return true;

        // Transfers Confirm Transfer
        case CB.TRANSFER_CONFIRM_CONFIRMATION:
          await ctx.answerCbQuery();
          const transferConfirmationSceneData = this.getSceneData(ctx);

          try {
            const tx = await this.service.transferETH(
              ctx,
              transferConfirmationSceneData,
              transferConfirmationSceneData.transferMode?.recipient!
            );

            await tx.waitReceipt;

            await ctx.reply(
              WALLET_TEXTS.FUNCTIONS.getSuccessTransferMsg(tx.txHash),
              {
                parse_mode: "HTML",
                link_preview_options: {
                  is_disabled: true,
                },
              }
            );
          } catch (error) {
            this.log("error", ctx, `Error in transferETH: ${error}`);
            await ctx.reply(
              WALLET_TEXTS.FUNCTIONS.getErrorTransferMsg(error as Error),
              {
                parse_mode: "HTML",
              }
            );
            this.resetSceneData(ctx);
            await this.menus.showTransfersMenu(ctx, sceneData, messageId);

            return false;
          }

          return true;

        // Transfers Cancel Transfer
        case CB.TRANSFER_CANCEL_CONFIRMATION:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await this.menus.showTransfersMenu(ctx, sceneData, messageId);
          return true;

        // Import Token
        case CB.IMPORT_TOKEN:
          await ctx.answerCbQuery();
          sceneData.importingToken = true;
          this.updateSceneData(ctx, sceneData);
          await this.menus.askForTokenAddressMenu(ctx, messageId);
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
      console.log(error);
      return false;
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `Handling text: ${text}`);
    const sceneData = this.getSceneData(ctx);
    const messageId = sceneData.menuMessageId;

    if (sceneData.importingToken) {
      sceneData.tokenAddress = text;
      this.updateSceneData(ctx, sceneData);

      const result = await this.service.importToken(ctx, sceneData, text);
      if (result?.success) {
        await this.menus.showImportTokenSuccessMenu(
          ctx,
          result.success,
          result.totalBalance || 0n,
          result.wallets || [],
          result.token!,
          messageId
        );
      } else {
        await this.menus.showImportTokenFailedMenu(
          ctx,
          result?.error || "Unknown error",
          messageId
        );
      }
      return true;
    }

    if (sceneData.transferMode?.step === "enter_amount") {
      if (!SendAmountValidator.isValidAmount(text)) {
        await this.menus.showInvalidAmountMenu(ctx, text, messageId);
        return true;
      }

      this.updateTransferMode(ctx, {
        customAmount: text,
        amount: undefined,
        step: "enter_recipient",
      });

      const textHandlerSceneData = this.getSceneData(ctx);
      await this.menus.showTransferRecipientMenu(
        ctx,
        textHandlerSceneData,
        messageId
      );
      return true;
    }

    if (sceneData.transferMode?.step === "enter_recipient") {
      if (!AddressValidator.parseEthereumAddress(text)) {
        await this.menus.showInvalidAddressMenu(ctx, text, messageId);
        return true;
      }

      this.updateTransferMode(ctx, {
        recipient: text,
      });

      const confirmationSceneData = this.getSceneData(ctx);
      await this.menus.showTransferConfirmationMenu(
        ctx,
        confirmationSceneData,
        messageId
      );
      return true;
    }

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
          this.resetSceneData(ctx);

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

  /**
   * Helper method to safely update transferMode while preserving existing properties
   */
  private updateTransferMode(
    ctx: GlobalSceneContext,
    updates: Partial<WalletsSceneData["transferMode"]>
  ): void {
    const sceneData = this.getSceneData(ctx);
    sceneData.transferMode = {
      ...sceneData.transferMode,
      ...updates,
    } as NonNullable<WalletsSceneData["transferMode"]>;
    this.updateSceneData(ctx, sceneData);
  }

  private resetSceneData(ctx: GlobalSceneContext): void {
    const sceneData = this.getSceneData(ctx);
    sceneData.importingPrivateKey = false;
    sceneData.transferMode = undefined;
    sceneData.privateKeyMessageId = undefined;

    this.updateSceneData(ctx, sceneData);
  }
}
