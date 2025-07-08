import { Markup } from "telegraf";
import { BaseMenus, GlobalSceneContext } from "../../types";
import { WalletsSceneData } from "../../types/session/SubSceneState";
import { CB } from "./callbacks";
import { WALLET_TEXTS } from "./messages";
import { GENERIC_BUTTONS } from "@texts";
import { UserWithWallets, WalletWithHoldings } from "@domain";
import { formatEthBalanceWithSymbol } from "@utils";
import { Token } from "@prisma/client";

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

  async showExportWalletMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Export Wallet menu");

    const keyboard = this.buildExportWalletKeyboard(sceneData.user!);
    const menuText = WALLET_TEXTS.MESSAGES.EXPORT_WALLET_TITLE;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showExportWalletDataMenu(
    ctx: GlobalSceneContext,
    address: string,
    privateKey: string,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Export Wallet Data menu");

    const keyboard = this.buildExportWalletDataKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getExportWalletDataMsg(
      address,
      privateKey
    );

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showImportWalletMenu(
    ctx: GlobalSceneContext,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Import Wallet menu");

    const keyboard = this.buildImportWalletKeyboard();
    const menuText = WALLET_TEXTS.MESSAGES.ENTER_PRIVATE_KEY_PROMPT;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showTransfersMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing Transfers menu");

    const keyboard = this.buildTransfersKeyboard(sceneData.user!);
    const menuText = WALLET_TEXTS.MESSAGES.TRANSFERS_TITLE;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  private buildTransfersKeyboard(user: UserWithWallets) {
    const inline_keyboard = user.wallets.map((w) => [
      {
        text: `${w.address} ${formatEthBalanceWithSymbol(w.balance)}`,
        callback_data: this.createCallback(
          CB.TRANSFERS_SELECT_WALLET,
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
        text: WALLET_TEXTS.BUTTONS.BACK,
        callback_data: this.createCallback(CB.WALLETS_ROOT),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_WALLETS),
      },
    ]);

    return inline_keyboard;
  }

  async askForTokenAddressMenu(
    ctx: GlobalSceneContext,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildAskForTokenKeyboard();
    const menuText = WALLET_TEXTS.MESSAGES.ASK_FOR_TOKEN_TITLE;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showImportTokenSuccessMenu(
    ctx: GlobalSceneContext,
    success: string,
    totalBalance: bigint,
    wallets: { address: string; balance: bigint }[],
    token: Token,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildImportTokenKeyboard();
    const menuText = `${WALLET_TEXTS.FUNCTIONS.getImportTokenSuccessMessage(
      success,
      totalBalance,
      wallets,
      token
    )}`;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  private buildImportTokenKeyboard() {
    return [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK,
          callback_data: this.createCallback(CB.WALLETS_ROOT),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }

  async showImportTokenFailedMenu(
    ctx: GlobalSceneContext,
    error: string,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildImportTokenKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getImportTokenFailedMessage(error);

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showWalletTransferMenu(
    ctx: GlobalSceneContext,
    wallet: WalletWithHoldings,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildWalletTransferKeyboard(wallet);
    const menuText = WALLET_TEXTS.MESSAGES.TRANFER_SELECT_TOKEN;

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showTransferAmountMenu(
    ctx: GlobalSceneContext,
    token: Token,
    wallet: WalletWithHoldings,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildTransferAmountKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getTokenTransferMessage(
      wallet,
      token
    );

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showTransferETHAmountMenu(
    ctx: GlobalSceneContext,
    wallet: WalletWithHoldings,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildTransferAmountKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getETHTransferMessage(wallet);

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showTransferRecipientMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildTransferRecipientKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getTransferRecipientMessage();

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showTransferCustomAmountMenu(
    ctx: GlobalSceneContext,
    wallet: WalletWithHoldings,
    messageId?: number
  ): Promise<number | undefined> {
    const keyboard = this.buildTransferAmountKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getTransferCustomAmountMessage();

    return this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showInvalidAddressMenu(
    ctx: GlobalSceneContext,
    address: string,
    messageId?: number
  ): Promise<void> {
    const keyboard = this.buildTransferRecipientKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getInvalidAddressMessage(address);

    await this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showInvalidAmountMenu(
    ctx: GlobalSceneContext,
    amount: string,
    messageId?: number
  ): Promise<void> {
    const keyboard = this.buildTransferAmountKeyboard();
    const menuText = WALLET_TEXTS.FUNCTIONS.getInvalidAmountMessage(amount);

    await this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  async showTransferConfirmationMenu(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    messageId?: number
  ): Promise<void> {
    const keyboard = this.buildTransferConfirmationKeyboard();
    const menuText =
      WALLET_TEXTS.FUNCTIONS.getTransferConfirmationMessage(sceneData);

    await this.sendOrUpdateMenu(ctx, menuText, keyboard, "HTML", messageId);
  }

  private buildAskForTokenKeyboard() {
    return [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK,
          callback_data: this.createCallback(CB.WALLETS_ROOT),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }

  private buildTransferConfirmationKeyboard() {
    return [
      [
        {
          text: WALLET_TEXTS.MESSAGES.CANCEL_TRANSFER_CONFIRMATION,
          callback_data: this.createCallback(CB.TRANSFER_CANCEL_CONFIRMATION),
        },
        {
          text: WALLET_TEXTS.MESSAGES.CONFIRM_TRANSFER_CONFIRMATION,
          callback_data: this.createCallback(CB.TRANSFER_CONFIRM_CONFIRMATION),
        },
      ],
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK_TO_TRANSFERS,
          callback_data: this.createCallback(CB.TRANSFERS),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }
  private buildTransferRecipientKeyboard() {
    return [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK_TO_TRANSFERS,
          callback_data: this.createCallback(CB.TRANSFERS),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }

  private buildTransferAmountKeyboard() {
    return [
      [
        {
          text: "10%",
          callback_data: this.createCallback(CB.TRANSFERS_SELECT_AMOUNT, "10"),
        },
        {
          text: "25%",
          callback_data: this.createCallback(CB.TRANSFERS_SELECT_AMOUNT, "25"),
        },
        {
          text: "50%",
          callback_data: this.createCallback(CB.TRANSFERS_SELECT_AMOUNT, "50"),
        },
      ],
      [
        {
          text: "100%",
          callback_data: this.createCallback(CB.TRANSFERS_SELECT_AMOUNT, "100"),
        },
        {
          text: "Custom",
          callback_data: this.createCallback(CB.TRANSFERS_ENTER_AMOUNT),
        },
      ],
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK_TO_TRANSFERS,
          callback_data: this.createCallback(CB.TRANSFERS),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }
  private buildWalletTransferKeyboard(wallet: WalletWithHoldings) {
    let inline_keyboard: any[][] = [];

    if (wallet.holdings.length > 0) {
      inline_keyboard = wallet.holdings.map((h) => [
        {
          text: `${h.token.symbol} ${formatEthBalanceWithSymbol(h.balance)}`,
          callback_data: this.createCallback(
            CB.TRANSFERS_SELECT_TOKEN,
            h.token.id.toString()
          ),
        },
      ]);
    }

    inline_keyboard.push([
      {
        text: WALLET_TEXTS.MESSAGES.ETH,
        callback_data: this.createCallback(CB.TRANSFERS_SELECT_TOKEN, "ETH"),
      },
    ]);

    inline_keyboard.push([
      {
        text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
        callback_data: this.createCallback(CB.MAIN_MENU),
      },
      {
        text: WALLET_TEXTS.BUTTONS.BACK_TO_TRANSFERS,
        callback_data: this.createCallback(CB.TRANSFERS),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_WALLETS),
      },
    ]);
    return inline_keyboard;
  }

  async showInvalidPrivateKeyMenu(
    ctx: GlobalSceneContext,
    message: string,
    messageId?: number
  ): Promise<void> {
    const keyboard = [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK,
          callback_data: this.createCallback(CB.WALLETS_ROOT),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];

    await this.sendOrUpdateMenu(ctx, message, keyboard, "HTML", messageId);
  }

  private buildImportWalletKeyboard() {
    return [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.BACK,
          callback_data: this.createCallback(CB.WALLETS_ROOT),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }
  private buildExportWalletDataKeyboard() {
    return [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: WALLET_TEXTS.BUTTONS.EXPORT_WALLET,
          callback_data: this.createCallback(CB.EXPORT_WALLET),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_WALLETS),
        },
      ],
    ];
  }

  private buildExportWalletKeyboard(user: UserWithWallets) {
    const inline_keyboard = user.wallets.map((w) => [
      {
        text: `${w.address} ${formatEthBalanceWithSymbol(w.balance)}`,
        callback_data: this.createCallback(
          CB.EXPORT_WALLET_SELECT,
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
        text: WALLET_TEXTS.BUTTONS.BACK,
        callback_data: this.createCallback(CB.WALLETS_ROOT),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_WALLETS),
      },
    ]);
    return inline_keyboard;
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
            text: WALLET_TEXTS.BUTTONS.BACK,
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
        text: WALLET_TEXTS.BUTTONS.BACK,
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
        text: WALLET_TEXTS.BUTTONS.BACK,
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
          WALLET_TEXTS.MESSAGES.IMPORT_TOKEN_BUTTON,
          this.createCallback(CB.IMPORT_TOKEN)
        ),
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
