import { GENERIC_BUTTONS, GENERIC_ERRORS } from "@texts";
import { BaseMenus, GlobalSceneContext, TradeSceneData } from "../../types";
import { CB } from "./callbacks";
import { TRADE_TEXTS } from "./messages";
import { formatEthBalanceWithSymbol } from "@utils";
import { Markup } from "telegraf";

export class TradeMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "TradeMenus");
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
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing trade menu");

    try {
      const token = sceneData.token;
      const bestDex = sceneData.bestDex;
      const wallets = sceneData.userWithWallets?.wallets;
      const buyAmount = sceneData.selectedAmount;

      const text = TRADE_TEXTS.FUNCTIONS.getTradeMessage(
        token!,
        bestDex!,
        wallets!,
        buyAmount!
      );

      const keyboard = this.getBuyKeyboard(sceneData);

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
    // Get all the wallets in sceneData.userWithWallets.wallets
    // Create a keyboard with the wallets
    // the text on the wallet should be W1 0.01 ETH like this
    // so we need to compare wallets with selected wallets
    const wallets = sceneData.userWithWallets?.wallets;
    const selectedWallets = sceneData.selectedWallets || [];
    const keyboard = [];

    // users have 5 amount options to buy, we need to create a keyboard with the amount options
    // 3 buttons per line amount 1, 2, 3 first line. 4, 5, and Custom amount in the second line

    const buySettings = sceneData.userWithSettings?.buySettings;
    const userAmounts = [
      buySettings!.amount1,
      buySettings!.amount2,
      buySettings!.amount3,
      buySettings!.amount4,
      buySettings!.amount5,
    ];

    // create a keyboard with the amount options, add a custom amount button in the second line at the end
    // only 1 amount can be selected at a time
    // Amount buttons (first 3)
    const firstRow = userAmounts
      .slice(0, 3)
      .map((amount: number, index: number) => {
        // Si hay custom amount, ningún botón predefinido debe estar seleccionado
        // Si no hay custom amount, verificar si este amount coincide con selectedAmount
        const isSelected =
          !sceneData.customAmount &&
          amount === Number(sceneData.selectedAmount);
        return Markup.button.callback(
          `💰 ${amount} Ξ${isSelected ? " 🟢" : ""}`,
          this.createCallback(CB.SELECT_AMOUNT, amount?.toString() ?? "")
        );
      });
    keyboard.push(firstRow);

    // Amount buttons (remaining 2 + custom)
    const secondRow = userAmounts.slice(3).map((amount: number) => {
      // Si hay custom amount, ningún botón predefinido debe estar seleccionado
      // Si no hay custom amount, verificar si este amount coincide con selectedAmount
      const isSelected =
        !sceneData.customAmount && amount === Number(sceneData.selectedAmount);
      return Markup.button.callback(
        `💰 ${amount} Ξ${isSelected ? " 🟢" : ""}`,
        this.createCallback(CB.SELECT_AMOUNT, amount?.toString() ?? "")
      );
    });

    // Custom amount button
    const customButtonText = sceneData.customAmount
      ? `💰 ${sceneData.customAmount} Ξ 🟢` // Mostrar el valor custom y marcar como seleccionado
      : `💰 Custom Ξ`; // Mostrar "Custom" cuando no hay valor

    secondRow.push(
      Markup.button.callback(
        customButtonText,
        this.createCallback(CB.SELECT_AMOUNT, "custom")
      )
    );
    keyboard.push(secondRow);

    // Slippage button and refresh button
    const slippageSettings =
      sceneData.userWithSettings?.buySettings ||
      sceneData.userWithSettings?.sellSettings;
    const slippageButtonText = sceneData.customSlippage
      ? `🛴 ${sceneData.customSlippage}% 🟢` // Mostrar el valor custom y marcar como seleccionado
      : `🛴 ${slippageSettings?.slippage || 30}%`; // Mostrar valor por defecto

    keyboard.push([
      Markup.button.callback(
        slippageButtonText,
        this.createCallback(CB.SELECT_SLIPPAGE)
      ),
      Markup.button.callback(
        "🔄 Refresh",
        this.createCallback(CB.REFRESH_QUOTE)
      ),
    ]);

    // Verificar que tenemos wallets
    if (!wallets || wallets.length === 0) {
      // Si no hay wallets, mostrar solo los botones de navegación
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
      return keyboard;
    }

    let i = 1;
    const walletButtons = []; // Array para almacenar todos los botones de wallets

    for (const wallet of wallets) {
      const isSelected = selectedWallets.includes(wallet.id);
      const walletButton = {
        text: `W${i} ${isSelected ? " 🟢" : ""}`,
        callback_data: this.createCallback(
          isSelected ? CB.UNSELECT_WALLET : CB.SELECT_WALLET,
          wallet.id.toString()
        ),
      };
      walletButtons.push(walletButton); // Agregar al array de botones
      i++;
    }

    // Agregar todas las wallets en una sola línea
    if (walletButtons.length > 0) {
      keyboard.push(walletButtons);
    }

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
