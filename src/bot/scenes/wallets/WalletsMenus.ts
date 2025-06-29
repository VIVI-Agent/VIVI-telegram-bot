import { Markup } from "telegraf";
import { BaseMenus, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { CB } from "./callbacks";
import { WALLET_TEXTS } from "./messages";
import { GENERIC_BUTTONS } from "@texts";
import { UserWithWallets } from "@domain";
import { formatEthBalanceWithSymbol } from "@utils";

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

      if (!selectedWallet) {
        throw new Error("No active wallet");
      }

      const walletInfo = WALLET_TEXTS.FUNCTIONS.buildActiveWalletSnippet(
        selectedWallet.address,
        selectedWallet.balance
      );

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
      throw new Error("No active wallet");
    }
  }

  async showListWalletsMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing List Wallets menu");

    const selectedWallet = sceneData.user?.wallets.filter(
      (wallet) => wallet.isSelected
    )[0];

    const user = sceneData.user;

    if (!selectedWallet || !user) {
      throw new Error("No active wallet");
    }

    const keyboard = this.buildListWalletsKeyboard(user!);
    let menuText = WALLET_TEXTS.MESSAGES.LIST_WALLETS_TITLE;

    user.wallets.forEach((w) => {
      const balanceBN = BigInt(w.balance || "0");
      const ethStr = formatEthBalanceWithSymbol(balanceBN);
      menuText += WALLET_TEXTS.FUNCTIONS.buildWalletBalanceLine(
        w.isSelected,
        w.address,
        ethStr
      );
    });

    const message_id = await this.sendOrUpdateMenu(
      ctx,
      menuText,
      keyboard,
      "HTML",
      messageId
    );

    return message_id;
  }

  async showMaxWalletsReached(ctx: GlobalSceneContext): Promise<void> {
    ctx.reply(WALLET_TEXTS.MESSAGES.MAX_WALLETS_REACHED);
  }

  async showCreateWalletMenu(
    ctx: GlobalSceneContext,
    address: string,
    privateKey: string,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Create Wallet menu");

    const keyboard = this.buildCreateWalletKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getNewWalletCreatedMsg(
      address,
      privateKey
    );

    const message_id = await this.sendOrUpdateMenu(
      ctx,
      menuText,
      keyboard,
      "HTML",
      messageId
    );

    return message_id;
  }

  async showRemoveWalletMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Remove Wallet menu");

    const keyboard = this.buildRemoveWalletKeyboard(sceneData.user!);
    const menuText = WALLET_TEXTS.MESSAGES.REMOVE_WALLET_TITLE;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showRemoveConfirmationMenu(
    ctx: GlobalSceneContext,
    walletIdToConfirm: number,
    address: string,
    balance: string,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Remove Confirmation menu");

    const keyboard = this.buildRemoveConfirmationKeyboard(walletIdToConfirm);
    const menuText = WALLET_TEXTS.FUNCTIONS.getRemoveWalletConfirmationMsg(
      address,
      balance
    );

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  private buildRemoveConfirmationKeyboard(walletIdToConfirm: number) {
    return [
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.CANCEL_REMOVE_WALLET,
          this.createCallback(CB.REMOVE_WALLET)
        ),
      ],
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.CONFIRM_REMOVE_WALLET,
          this.createCallback(
            CB.REMOVE_WALLET_SELECT,
            walletIdToConfirm.toString()
          )
        ),
      ],
    ];
  }

  private buildCreateWalletKeyboard() {
    return [
      [
        Markup.button.callback(
          WALLET_TEXTS.MESSAGES.SAVED_PRIVATE_KEY_BUTTON,
          this.createCallback(CB.SAVED_PRIVATE_KEY)
        ),
      ],
    ];
  }

  private buildRemoveWalletKeyboard(user: UserWithWallets) {
    const unSelectedWallets = user.wallets.filter((w) => !w.isSelected);
    if (unSelectedWallets.length === 0) {
      return [
        // No wallets to remove
        [
          {
            text: WALLET_TEXTS.ERRORS.NO_WALLETS_TO_REMOVE,
            callback_data: this.createCallback(CB.WALLETS_ROOT),
          },
        ],
        [
          {
            text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
            callback_data: this.createCallback(CB.MAIN_MENU),
          },
          {
            text: GENERIC_BUTTONS.BACK,
            callback_data: this.createCallback(CB.WALLETS_ROOT),
          },
          {
            text: GENERIC_BUTTONS.DISMISS,
            callback_data: this.createCallback(CB.DISMISS_WALLETS),
          },
        ],
      ];
    }

    const inline_keyboard = unSelectedWallets.map((w) => [
      {
        text: `${w.address} ${formatEthBalanceWithSymbol(w.balance)}`,
        callback_data: this.createCallback(
          CB.REMOVE_WALLET_CONFIRM,
          w.id.toString()
        ),
      },
    ]);
    inline_keyboard.push([
      {
        text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
        callback_data: this.createCallback(CB.MAIN_MENU),
      },
      {
        text: GENERIC_BUTTONS.BACK,
        callback_data: this.createCallback(CB.WALLETS_ROOT),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_WALLETS),
      },
    ]);
    return inline_keyboard;
  }
  private buildListWalletsKeyboard(user: UserWithWallets) {
    const inline_keyboard = user.wallets.map((w) => [
      {
        text: w.isSelected ? `✅ ${w.address}` : w.address,
        callback_data: this.createCallback(CB.SELECT_WALLET, w.id.toString()),
      },
    ]);
    inline_keyboard.push([
      {
        text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
        callback_data: this.createCallback(CB.MAIN_MENU),
      },
      {
        text: GENERIC_BUTTONS.BACK,
        callback_data: this.createCallback(CB.WALLETS_ROOT),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_WALLETS),
      },
    ]);
    return inline_keyboard;
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
