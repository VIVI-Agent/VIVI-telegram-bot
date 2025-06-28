import { Markup } from "telegraf";
import { BaseMenus, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { CB } from "./callbacks";
import { WALLET_TEXTS, WALLETS_TEXTS } from "./messages";
import { GENERIC_BUTTONS } from "@texts";

export class WalletsMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "WalletsMenus");
  }

  async showWalletsMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Wallets menu");

    try {
      const selectedWallet = sceneData.user?.wallets.filter(
        (wallet) => wallet.isSelected
      )[0];

      const walletInfo = selectedWallet
        ? WALLET_TEXTS.FUNCTIONS.buildActiveWalletSnippet(
            selectedWallet.isSelected,
            selectedWallet.address,
            selectedWallet.balance
          )
        : WALLET_TEXTS.MESSAGES.NO_ACTIVE_WALLET;

      const menuText = WALLET_TEXTS.FUNCTIONS.buildMenuText(walletInfo);
      const keyboard = this.buildWalletsKeyboard();

      const message_id = await this.sendOrUpdateMenu(
        ctx,
        menuText,
        keyboard,
        "HTML",
        messageId
      );

      return message_id;
    } catch (error) {
      this.logError(ctx, "showWalletsMenu", error);
      await ctx.reply(WALLETS_TEXTS.ERRORS.WALLET_MENU_ERROR);
      return undefined;
    }
  }

  private buildWalletsKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.LIST_WALLETS_BUTTON,
          this.createCallback(CB.LIST_WALLETS)
        ),
      ],
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.CREATE_WALLET_BUTTON,
          this.createCallback(CB.CREATE_WALLET)
        ),
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.REMOVE_WALLET,
          this.createCallback(CB.REMOVE_WALLET)
        ),
      ],
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.IMPORT_WALLET_BUTTON,
          this.createCallback(CB.IMPORT_WALLET)
        ),
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.EXPORT_WALLET,
          this.createCallback(CB.EXPORT_WALLET)
        ),
      ],
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.TRANSFERS_BUTTON,
          this.createCallback(CB.TRANSFERS)
        ),
      ],
      [
        Markup.button.callback(
          GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          this.createCallback(CB.MAIN_MENU)
        ),
        Markup.button.callback(
          GENERIC_BUTTONS.DISMISS,
          this.createCallback(CB.DISMISS_WALLETS)
        ),
      ],
    ]).reply_markup.inline_keyboard;
  }
}
