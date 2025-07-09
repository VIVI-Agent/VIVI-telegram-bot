import { GENERIC_BUTTONS, GENERIC_ERRORS } from "@texts";
import { BaseMenus, GlobalSceneContext, TradeSceneData } from "../../types";
import { CB } from "./callbacks";
import { TRADE_TEXTS } from "./messages";
import { Markup } from "telegraf";

export class TradeMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "TradeMenus");
  }

  /**
   * Helper method to check if user has tokens to sell
   */
  private hasTokensToSell(sceneData: TradeSceneData): boolean {
    if (!sceneData.userWithWallets?.wallets || !sceneData.token) {
      return false;
    }

    return sceneData.userWithWallets.wallets.some((wallet) => {
      return (
        wallet.holdings &&
        wallet.holdings.balance &&
        BigInt(wallet.holdings.balance) > BigInt(0)
      );
    });
  }

  async askForTokenMenu(ctx: GlobalSceneContext): Promise<number | undefined> {
    this.log("info", ctx, "Asking for token menu");

    const text = TRADE_TEXTS.FUNCTIONS.getWaitingTokenMessage();

    const keyboard = [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_TRADE),
        },
      ],
    ];

    return await this.sendOrUpdateMenu(ctx, text, keyboard, "HTML");
  }

  async askForTokenMenuAgain(
    ctx: GlobalSceneContext,
    messageId: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Asking for token menu again");

    const text = TRADE_TEXTS.FUNCTIONS.getInvalidTokenMessage();
    const keyboard = [
      [
        {
          text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
          callback_data: this.createCallback(CB.MAIN_MENU),
        },
        {
          text: GENERIC_BUTTONS.DISMISS,
          callback_data: this.createCallback(CB.DISMISS_TRADE),
        },
      ],
    ];
    return await this.sendOrUpdateMenu(ctx, text, keyboard, "HTML", messageId);
  }

  /**
   * Show the main trade menu
   */
  async showTradeMenu(
    ctx: GlobalSceneContext,
    sceneData: TradeSceneData,
    messageId?: number,
    hideMenuKeyboard?: boolean
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing trade menu");

    try {
      const token = sceneData.token;
      const bestDex = sceneData.bestDex;
      const wallets = sceneData.userWithWallets?.wallets;
      const amount = sceneData.selectedAmount;

      // Sum up all the tokens holding for the user
      const totalHoldings = wallets?.reduce((acc, wallet) => {
        if (!wallet.holdings?.balance) return acc;
        const balance = BigInt(wallet.holdings.balance);
        const formattedBalance = Number(balance) / 10 ** token!.decimals;
        return acc + formattedBalance;
      }, 0);

      const text = TRADE_TEXTS.FUNCTIONS.getTradeMessage(
        token!,
        bestDex!,
        wallets!,
        amount!,
        sceneData.state === "trade_sell", // Pass mode to determine message type
        sceneData.externalTokenInfo, // Pass token info from scene data
        totalHoldings?.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })
      );

      if (hideMenuKeyboard) {
        return await this.sendOrUpdateMenu(
          ctx,
          text,
          [
            [
              {
                text: `⏳ Sending ${
                  sceneData.state === "trade_sell" ? "Sell" : "Buy"
                } Tx ${sceneData.token?.symbol}`,
                callback_data: "noop",
              },
            ],
          ],
          "HTML",
          messageId
        );
      }

      // Use different keyboard based on the current mode
      const keyboard =
        sceneData.state === "trade_sell"
          ? this.getSellKeyboard(sceneData)
          : this.getBuyKeyboard(sceneData);

      return await this.sendOrUpdateMenu(
        ctx,
        text,
        keyboard,
        "HTML",
        messageId
      );
    } catch (error) {
      this.log("error", ctx, `Error showing trade menu: ${error}`);
      await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
      return undefined;
    }
  }

  private getBuyKeyboard(sceneData: TradeSceneData) {
    const wallets = sceneData.userWithWallets?.wallets;
    const selectedWallets = sceneData.selectedWallets || [];
    const keyboard = [];

    // Refresh button (solo at the top)
    keyboard.push([
      Markup.button.callback(
        "♻️ Refresh",
        this.createCallback(CB.REFRESH_QUOTE)
      ),
    ]);

    // Navigation buttons (moved to top)
    keyboard.push([
      {
        text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
        callback_data: this.createCallback(CB.MAIN_MENU),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_TRADE),
      },
    ]);

    // Add switch to sell button if user has tokens to sell
    if (this.hasTokensToSell(sceneData)) {
      keyboard.push([
        Markup.button.callback(
          "🔄 Switch to Sell",
          this.createCallback(CB.SWITCH_TO_SELL)
        ),
      ]);
    }

    const buySettings = sceneData.userWithSettings?.buySettings;
    const userAmounts = [
      buySettings!.amount1,
      buySettings!.amount2,
      buySettings!.amount3,
      buySettings!.amount4,
      buySettings!.amount5,
    ];

    // Create amount buttons
    const amountButtons = userAmounts.map((amount: number) => {
      const isSelected =
        !sceneData.customAmount && amount === Number(sceneData.selectedAmount);
      return Markup.button.callback(
        `💰 ${amount} Ξ${isSelected ? " 🟢" : ""}`,
        this.createCallback(CB.SELECT_AMOUNT, amount?.toString() ?? "")
      );
    });

    // Custom amount button
    const customButtonText = sceneData.customAmount
      ? `💰 ${sceneData.customAmount} Ξ 🟢`
      : `💰 Custom Ξ`;

    const customButton = Markup.button.callback(
      customButtonText,
      this.createCallback(CB.SELECT_AMOUNT, "custom")
    );

    // Organize buttons in rows of 2: [1,2], [3,4], [5,Custom]
    keyboard.push([amountButtons[0], amountButtons[1]]); // Amount1, Amount2
    keyboard.push([amountButtons[2], amountButtons[3]]); // Amount3, Amount4
    keyboard.push([amountButtons[4], customButton]); // Amount5, Custom

    // Wallet selection
    if (!wallets || wallets.length === 0) {
      // Add slippage and gas buttons even if no wallets
      const slippageSettings = sceneData.userWithSettings?.buySettings;
      const slippageButtonText = sceneData.customSlippage
        ? `Slip ${sceneData.customSlippage}% 🟢`
        : `Slip ${slippageSettings?.slippage || 30}%`;

      const gasSpeed = sceneData.gasSpeed || "auto";
      keyboard.push([
        Markup.button.callback(
          slippageButtonText,
          this.createCallback(CB.SELECT_SLIPPAGE)
        ),
        Markup.button.callback(
          `⛽️ 0.1${gasSpeed === "auto" ? " 🟢" : ""}`,
          this.createCallback(CB.SET_GAS_AUTO)
        ),
        Markup.button.callback(
          `⛽️ 1${gasSpeed === "fast" ? " 🟢" : ""}`,
          this.createCallback(CB.SET_GAS_FAST)
        ),
        Markup.button.callback(
          `⛽️ 5${gasSpeed === "turbo" ? " 🟢" : ""}`,
          this.createCallback(CB.SET_GAS_TURBO)
        ),
      ]);

      keyboard.push([
        {
          text: "⚡ BUY",
          callback_data: this.createCallback(CB.BUY_TOKEN),
        },
      ]);

      return keyboard;
    }

    const walletButtons = wallets.map((wallet, index) => {
      const isSelected = selectedWallets.includes(wallet.id);
      return {
        text: `W${index + 1}${isSelected ? " 🟢" : ""}`,
        callback_data: this.createCallback(
          isSelected ? CB.UNSELECT_WALLET : CB.SELECT_WALLET,
          wallet.id.toString()
        ),
      };
    });

    // Add "All" toggle button
    const allWalletsSelected = wallets.every((wallet) =>
      selectedWallets.includes(wallet.id)
    );
    const allButtonText = allWalletsSelected ? "All 🟢" : "All";

    if (walletButtons.length > 0) {
      // If 3 or fewer wallets, put "All" button on the same line
      if (walletButtons.length <= 3) {
        const rowWithAll = [
          ...walletButtons,
          {
            text: allButtonText,
            callback_data: this.createCallback(CB.TOGGLE_ALL_WALLETS),
          },
        ];
        keyboard.push(rowWithAll);
      } else {
        // If 4-5 wallets, put wallet buttons first, then "All" on separate line
        keyboard.push(walletButtons);
        keyboard.push([
          {
            text: allButtonText,
            callback_data: this.createCallback(CB.TOGGLE_ALL_WALLETS),
          },
        ]);
      }
    }

    // Slippage and Gas buttons
    const slippageSettings = sceneData.userWithSettings?.buySettings;
    const slippageButtonText = sceneData.customSlippage
      ? `Slip ${sceneData.customSlippage}% 🟢`
      : `Slip ${slippageSettings?.slippage || 30}%`;

    const gasSpeed = sceneData.gasSpeed || "auto";
    keyboard.push([
      Markup.button.callback(
        slippageButtonText,
        this.createCallback(CB.SELECT_SLIPPAGE)
      ),
      Markup.button.callback(
        `⛽️ 0.1${gasSpeed === "auto" ? " 🟢" : ""}`,
        this.createCallback(CB.SET_GAS_AUTO)
      ),
      Markup.button.callback(
        `⛽️ 1${gasSpeed === "fast" ? " 🟢" : ""}`,
        this.createCallback(CB.SET_GAS_FAST)
      ),
      Markup.button.callback(
        `⛽️ 5${gasSpeed === "turbo" ? " 🟢" : ""}`,
        this.createCallback(CB.SET_GAS_TURBO)
      ),
    ]);

    // Buy button
    keyboard.push([
      {
        text: "⚡ BUY",
        callback_data: this.createCallback(CB.BUY_TOKEN),
      },
    ]);

    return keyboard;
  }

  private getSellKeyboard(sceneData: TradeSceneData) {
    const wallets = sceneData.userWithWallets?.wallets;
    const selectedWallets = sceneData.selectedWallets || [];
    const keyboard = [];

    // Refresh button (solo at the top)
    keyboard.push([
      Markup.button.callback(
        "♻️ Refresh",
        this.createCallback(CB.REFRESH_QUOTE)
      ),
    ]);

    // Navigation buttons (moved to top)
    keyboard.push([
      {
        text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
        callback_data: this.createCallback(CB.MAIN_MENU),
      },
      {
        text: GENERIC_BUTTONS.DISMISS,
        callback_data: this.createCallback(CB.DISMISS_TRADE),
      },
    ]);

    // Add switch to buy button
    keyboard.push([
      Markup.button.callback(
        "🔄 Switch to Buy",
        this.createCallback(CB.SWITCH_TO_BUY)
      ),
    ]);

    const sellSettings = sceneData.userWithSettings?.sellSettings;
    const userPercentages = [
      sellSettings!.amount1, // These are percentages for sell
      sellSettings!.amount2,
      sellSettings!.amount3,
    ];

    // Create percentage buttons
    const percentageButtons = userPercentages.map((percentage: number) => {
      const isSelected =
        !sceneData.customAmount &&
        percentage === Number(sceneData.selectedAmount);
      return Markup.button.callback(
        `💰 ${percentage}%${isSelected ? " 🟢" : ""}`,
        this.createCallback(CB.SELECT_PERCENTAGE, percentage?.toString() ?? "")
      );
    });

    // Custom percentage button
    const customButtonText = sceneData.customAmount
      ? `💰 ${sceneData.customAmount}% 🟢`
      : `💰 Custom %`;

    const customButton = Markup.button.callback(
      customButtonText,
      this.createCallback(CB.SELECT_PERCENTAGE, "custom")
    );

    // Organize percentage buttons in 2 columns: [1,2], [3,Custom]
    keyboard.push([percentageButtons[0], percentageButtons[1]]); // Percentage1, Percentage2
    keyboard.push([percentageButtons[2], customButton]); // Percentage3, Custom

    // Wallet selection (only show wallets with tokens)
    if (!wallets || wallets.length === 0) {
      // Add slippage and gas buttons even if no wallets
      const slippageSettings = sceneData.userWithSettings?.sellSettings;
      const slippageButtonText = sceneData.customSlippage
        ? `Slip ${sceneData.customSlippage}% 🟢`
        : `Slip ${slippageSettings?.slippage || 30}%`;

      const gasSpeed = sceneData.gasSpeed || "auto";
      keyboard.push([
        Markup.button.callback(
          slippageButtonText,
          this.createCallback(CB.SELECT_SLIPPAGE)
        ),
        Markup.button.callback(
          `⛽️ 0.1${gasSpeed === "auto" ? " 🟢" : ""}`,
          this.createCallback(CB.SET_GAS_AUTO)
        ),
        Markup.button.callback(
          `⛽️ 1${gasSpeed === "fast" ? " 🟢" : ""}`,
          this.createCallback(CB.SET_GAS_FAST)
        ),
        Markup.button.callback(
          `⛽️ 5${gasSpeed === "turbo" ? " 🟢" : ""}`,
          this.createCallback(CB.SET_GAS_TURBO)
        ),
      ]);

      keyboard.push([
        {
          text: "⚡ SELL",
          callback_data: this.createCallback(CB.SELL_TOKEN),
        },
      ]);

      return keyboard;
    }

    const walletButtons = wallets.map((wallet, index) => {
      const isSelected = selectedWallets.includes(wallet.id);
      const originalIndex = wallets.findIndex((w) => w.id === wallet.id) + 1;
      return {
        text: `W${originalIndex}${isSelected ? " 🟢" : ""}`,
        callback_data: this.createCallback(
          isSelected ? CB.UNSELECT_WALLET : CB.SELECT_WALLET,
          wallet.id.toString()
        ),
      };
    });

    // Add "All" toggle button
    const allWalletsSelected = wallets.every((wallet) =>
      selectedWallets.includes(wallet.id)
    );
    const allButtonText = allWalletsSelected ? "All 🟢" : "All";

    if (walletButtons.length > 0) {
      // If 3 or fewer wallets, put "All" button on the same line
      if (walletButtons.length <= 3) {
        const rowWithAll = [
          ...walletButtons,
          {
            text: allButtonText,
            callback_data: this.createCallback(CB.TOGGLE_ALL_WALLETS),
          },
        ];
        keyboard.push(rowWithAll);
      } else {
        // If 4-5 wallets, put wallet buttons first, then "All" on separate line
        keyboard.push(walletButtons);
        keyboard.push([
          {
            text: allButtonText,
            callback_data: this.createCallback(CB.TOGGLE_ALL_WALLETS),
          },
        ]);
      }
    }

    // Slippage and Gas buttons
    const slippageSettings = sceneData.userWithSettings?.sellSettings;
    const slippageButtonText = sceneData.customSlippage
      ? `Slip ${sceneData.customSlippage}% 🟢`
      : `Slip ${slippageSettings?.slippage || 30}%`;

    const gasSpeed = sceneData.gasSpeed || "auto";
    keyboard.push([
      Markup.button.callback(
        slippageButtonText,
        this.createCallback(CB.SELECT_SLIPPAGE)
      ),
      Markup.button.callback(
        `⛽️ 0.1${gasSpeed === "auto" ? " 🟢" : ""}`,
        this.createCallback(CB.SET_GAS_AUTO)
      ),
      Markup.button.callback(
        `⛽️ 1${gasSpeed === "fast" ? " 🟢" : ""}`,
        this.createCallback(CB.SET_GAS_FAST)
      ),
      Markup.button.callback(
        `⛽️ 5${gasSpeed === "turbo" ? " 🟢" : ""}`,
        this.createCallback(CB.SET_GAS_TURBO)
      ),
    ]);

    // Sell button
    keyboard.push([
      {
        text: "⚡ SELL",
        callback_data: this.createCallback(CB.SELL_TOKEN),
      },
    ]);

    return keyboard;
  }

  async askCustomAmountMenu(
    ctx: GlobalSceneContext
  ): Promise<number | undefined> {
    this.log("info", ctx, "Asking for custom amount menu");

    const text = TRADE_TEXTS.FUNCTIONS.getCustomAmountMessage();
    const sentMessage = await ctx.reply(text, {
      reply_markup: {
        force_reply: true,
      },
    });
    return sentMessage.message_id;
  }

  async askCustomPercentageMenu(
    ctx: GlobalSceneContext
  ): Promise<number | undefined> {
    this.log("info", ctx, "Asking for custom percentage menu");

    const text = TRADE_TEXTS.FUNCTIONS.getCustomPercentageMessage();
    const sentMessage = await ctx.reply(text, {
      reply_markup: {
        force_reply: true,
      },
    });
    return sentMessage.message_id;
  }

  async askCustomSlippageMenu(
    ctx: GlobalSceneContext
  ): Promise<number | undefined> {
    this.log("info", ctx, "Asking for custom slippage menu");

    const text = TRADE_TEXTS.FUNCTIONS.getCustomSlippageMessage();
    const sentMessage = await ctx.reply(text, {
      reply_markup: {
        force_reply: true,
      },
    });
    return sentMessage.message_id;
  }
}
