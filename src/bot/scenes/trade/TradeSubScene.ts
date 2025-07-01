import { GENERIC_ERRORS } from "@texts";
import { BaseSubScene, GlobalSceneContext, TradeSceneData } from "../../types";
import { TradeMenus } from "./TradeMenus";
import { TradeService } from "./TradeService";
import { CB } from "./callbacks";
import { TRADE_TEXTS } from "./messages";
import { AddressValidator, BuyAmountValidator } from "@utils";
import { bigint } from "zod";

export class TradeSubScene extends BaseSubScene<TradeSceneData> {
  private menus: TradeMenus;
  private service: TradeService;

  constructor(instanceId: string) {
    super(instanceId, "Trade");
    this.menus = new TradeMenus(instanceId);
    this.service = new TradeService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Trade scene");
    // Initialize scene data
    const sceneData: TradeSceneData = {
      menuMessageId: undefined,
      state: "waiting_token",
      token: undefined,
      selectedWallets: [],
      editMode: {
        customAmount: false,
        customSlippage: false,
      },
    };

    // Handle data parameters
    try {
      if (data && (data.mode === "buy" || data.mode === "sell")) {
        if (data.token) {
          const token = await this.service.findToken(ctx, data.token);
          if (token) {
            // Set token data
            sceneData.token = token;
            sceneData.state = data.mode === "buy" ? "trade_buy" : "trade_sell";
            this.updateSceneData(ctx, sceneData);
          } else {
            // Handle error or invalid token address
            await ctx.reply(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
            await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
            return;
          }
        }
      }

      let menuMessageId: number | undefined;

      if (sceneData.state === "waiting_token") {
        menuMessageId = await this.menus.askForTokenMenu(ctx);
      } else {
        // Get user with settings
        const [userWithSettings, wallets] = await Promise.all([
          this.service.getUserWithSettings(ctx),
          this.service.getUserWalletsWithHolding(ctx, sceneData.token?.id!),
        ]);
        if (userWithSettings && wallets) {
          sceneData.userWithSettings = userWithSettings;
          sceneData.userWithWallets = wallets;
          // Get best dex, will return sell or buy quote depending on the state
          const bestDex = await this.service.getBestDex(ctx, sceneData);
          if (bestDex) {
            sceneData.bestDex = bestDex.best;
          }

          if (sceneData.state === "trade_buy") {
            sceneData.selectedAmount =
              sceneData.userWithSettings.buySettings?.amount1?.toString();
            sceneData.selectedSlippage =
              sceneData.userWithSettings.buySettings?.slippage?.toString();
            this.updateSceneData(ctx, sceneData);
            // Check each wallet in sceneData.wallets eth balance to buy tokens and set walletSelected if the has enough eth.
            // balance on eht is in wallet.balance field as string, set sceneData.selectedWallets with the wallet id if the has enough eth.
            const ethAmount =
              sceneData.userWithSettings.buySettings?.amount1 ?? 0.01;
            // Convertir ETH a Wei para comparar con wallet.balance (que está en Wei)
            const ethAmountInWei = BigInt(Math.floor(ethAmount * 10 ** 18));

            for (const wallet of sceneData.userWithWallets.wallets) {
              if (wallet.balance && BigInt(wallet.balance) > ethAmountInWei) {
                sceneData.selectedWallets?.push(wallet.id);
                this.log(
                  "info",
                  ctx,
                  `Wallet ${wallet.id} has enough ETH: ${
                    wallet.balance
                  } Wei > ${ethAmountInWei.toString()} Wei`
                );
              } else {
                this.log(
                  "debug",
                  ctx,
                  `Wallet ${wallet.id} insufficient ETH: ${
                    wallet.balance || "0"
                  } Wei <= ${ethAmountInWei.toString()} Wei`
                );
              }
            }
            this.log(
              "info",
              ctx,
              `Selected wallets TO BUY: ${sceneData.selectedWallets}`
            );
          } else if (sceneData.state === "trade_sell") {
            sceneData.selectedAmount =
              sceneData.userWithSettings.sellSettings?.amount1?.toString();
            sceneData.selectedSlippage =
              sceneData.userWithSettings.sellSettings?.slippage?.toString();
            this.updateSceneData(ctx, sceneData);
            // First check wallet.balance >0, if not, skip
            // Then check wallet.holdings.balance >0, if not, skip
            // Set selectedWallets with the wallet address if the has enough eth and token balance
            for (const wallet of sceneData.userWithWallets.wallets) {
              // Check if wallet has ETH balance > 0 (for gas fees)
              const hasEthBalance =
                wallet.balance && BigInt(wallet.balance) > BigInt(0);

              // Check if wallet has token holdings > 0 (tokens to sell)
              const hasTokenBalance =
                wallet.holdings &&
                wallet.holdings.balance &&
                BigInt(wallet.holdings.balance) > BigInt(0);

              // Only select wallets that have both ETH and tokens
              if (hasEthBalance && hasTokenBalance) {
                sceneData.selectedWallets?.push(wallet.id);
                this.log(
                  "info",
                  ctx,
                  `Selected wallet ${wallet.address}: ETH=${wallet.balance}, Token=${wallet.holdings?.balance}`
                );
              } else {
                this.log(
                  "debug",
                  ctx,
                  `Skipped wallet ${wallet.address}: ETH=${
                    wallet.balance || "0"
                  }, Token=${wallet.holdings?.balance || "0"}`
                );
              }
            }

            this.log(
              "info",
              ctx,
              `Total selected wallets for sell: ${
                sceneData.selectedWallets?.length || 0
              }`
            );
          }

          // Show trade menu
          menuMessageId = await this.menus.showTradeMenu(ctx, sceneData);
        }
      }

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
    } catch (error) {
      this.log("error", ctx, `Error activating trade scene: ${error}`);
      await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
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
        // Main navigation
        case CB.MAIN_MENU:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;

        case CB.DISMISS_TRADE:
          await ctx.answerCbQuery();
          this.resetSceneData(ctx);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;

        // Trade actions
        case CB.BUY_TOKEN:
          await ctx.answerCbQuery();
          // TODO: Implement buy token logic
          await ctx.reply("💚 Buy Token functionality coming soon!");
          return true;

        case CB.SELL_TOKEN:
          await ctx.answerCbQuery();
          // TODO: Implement sell token logic
          await ctx.reply("❤️ Sell Token functionality coming soon!");
          return true;

        case CB.SELECT_WALLET:
          await ctx.answerCbQuery();
          if (params && params[0]) {
            const walletId = parseInt(params[0]);
            const sceneData = this.getSceneData(ctx);
            if (!sceneData.selectedWallets) {
              sceneData.selectedWallets = [];
            }
            if (!sceneData.selectedWallets.includes(walletId)) {
              sceneData.selectedWallets.push(walletId);
              this.log("info", ctx, `Selected wallet ID: ${walletId}`);
            }
            // Update the menu
            const updatedMenuId = await this.menus.showTradeMenu(
              ctx,
              sceneData,
              messageId
            );
            if (updatedMenuId) {
              sceneData.menuMessageId = updatedMenuId;
            }
            this.updateSceneData(ctx, sceneData);
          }
          return true;

        case CB.UNSELECT_WALLET:
          await ctx.answerCbQuery();
          if (params && params[0]) {
            const walletId = parseInt(params[0]);
            const sceneData = this.getSceneData(ctx);
            if (sceneData.selectedWallets) {
              sceneData.selectedWallets = sceneData.selectedWallets.filter(
                (id) => id !== walletId
              );
              this.log("info", ctx, `Unselected wallet ID: ${walletId}`);
            }
            // Update the menu
            this.updateSceneData(ctx, sceneData);

            await this.menus.showTradeMenu(ctx, sceneData, messageId);
          }
          return true;

        case CB.SELECT_AMOUNT:
          await ctx.answerCbQuery();
          if (params && params[0]) {
            // if params[0] is "custom", set sceneData.editMode.customAmount to true
            // call menu to ask for custom amount using askCustomAmountMenu
            if (params[0] === "custom") {
              sceneData.editMode = {
                customAmount: true,
                customSlippage: false,
              };
              // Inicializar array para messageIds temporales
              sceneData.tempCustomAmountMessageIds = [];
              this.updateSceneData(ctx, sceneData);
              const customAmountMessageId =
                await this.menus.askCustomAmountMenu(ctx);
              if (customAmountMessageId) {
                // Guardar el messageId inicial del bot
                sceneData.tempCustomAmountMessageIds.push(
                  customAmountMessageId
                );
                this.updateSceneData(ctx, sceneData);
              }
            } else {
              // Seleccionar un amount predefinido
              const amount = params[0];
              sceneData.selectedAmount = amount;
              sceneData.editMode = {
                customAmount: false,
                customSlippage: false,
              };
              // Limpiar datos de custom amount cuando se selecciona un predefinido
              sceneData.customAmount = undefined;
              sceneData.tempCustomAmountMessageIds = [];
              this.updateSceneData(ctx, sceneData);

              // Refresh quote with new amount and update menu
              await this.refreshQuoteAndMenu(ctx);
            }
          }
          return true;

        case CB.SELECT_SLIPPAGE:
          await ctx.answerCbQuery();
          // Activar modo de edición de slippage custom
          sceneData.editMode = {
            customAmount: false,
            customSlippage: true,
          };
          // Inicializar array para messageIds temporales
          sceneData.tempCustomSlippageMessageIds = [];
          this.updateSceneData(ctx, sceneData);
          const customSlippageMessageId =
            await this.menus.askCustomSlippageMenu(ctx);
          if (customSlippageMessageId) {
            // Guardar el messageId inicial del bot
            sceneData.tempCustomSlippageMessageIds.push(
              customSlippageMessageId
            );
            this.updateSceneData(ctx, sceneData);
          }
          return true;

        case CB.REFRESH_QUOTE:
          await ctx.answerCbQuery();
          await this.refreshQuoteAndMenu(ctx);
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
    this.log("debug", ctx, `Scene state: ${this.getSceneData(ctx).state}`);

    if (this.getSceneData(ctx).state === "waiting_token" && text) {
      try {
        const tokenAddress = AddressValidator.parseEthereumAddress(text);
        if (tokenAddress) {
          const token = await this.service.findToken(ctx, tokenAddress);
          if (token) {
            const sceneData = this.getSceneData(ctx);
            sceneData.token = token;
            sceneData.state = "trade_buy";
            const menuMessageId = await this.menus.showTradeMenu(
              ctx,
              sceneData,
              this.getSceneData(ctx).menuMessageId!
            );
            if (menuMessageId) {
              sceneData.menuMessageId = menuMessageId;
              this.updateSceneData(ctx, sceneData);
            }
            return true;
          }
        }
        this.menus.askForTokenMenuAgain(
          ctx,
          this.getSceneData(ctx).menuMessageId!
        );
      } catch (error) {
        ctx.reply(GENERIC_ERRORS.OLD_VERSION);
      }
    }
    if (this.getSceneData(ctx).editMode?.customAmount && text) {
      const sceneData = this.getSceneData(ctx);
      const validationResult = BuyAmountValidator.validate(text, false);

      // Guardar el messageId del usuario en el array temporal
      if (ctx.message?.message_id) {
        sceneData.tempCustomAmountMessageIds =
          sceneData.tempCustomAmountMessageIds || [];
        sceneData.tempCustomAmountMessageIds.push(ctx.message.message_id);
      }

      if (validationResult.isValid) {
        // Establecer el custom amount y también como selectedAmount
        sceneData.customAmount = text;
        sceneData.selectedAmount = text; // Importante: establecer también selectedAmount

        // Borrar TODOS los mensajes temporales acumulados
        if (
          sceneData.tempCustomAmountMessageIds &&
          sceneData.tempCustomAmountMessageIds.length > 0
        ) {
          for (const msgId of sceneData.tempCustomAmountMessageIds) {
            try {
              await ctx.deleteMessage(msgId);
            } catch (error) {
              this.log(
                "debug",
                ctx,
                `Could not delete message ${msgId}: ${error}`
              );
            }
          }
        }

        sceneData.editMode = {
          customAmount: false,
          customSlippage: false,
        };
        sceneData.tempCustomAmountMessageIds = []; // Limpiar array
        this.updateSceneData(ctx, sceneData);

        this.log("info", ctx, `Custom amount set: ${text}`);
      } else {
        // Valor inválido: mostrar error y guardar su messageId
        const errorMessage = await ctx.reply(
          "❌ Invalid amount. Please try again."
        );
        sceneData.tempCustomAmountMessageIds =
          sceneData.tempCustomAmountMessageIds || [];
        sceneData.tempCustomAmountMessageIds.push(errorMessage.message_id);

        const retryMessage = await this.menus.askCustomAmountMenu(ctx);
        if (retryMessage) {
          sceneData.tempCustomAmountMessageIds.push(retryMessage);
        }
        this.updateSceneData(ctx, sceneData);
      }

      // Solo refrescar quote y mostrar menu si la validación fue exitosa
      if (validationResult.isValid) {
        await this.refreshQuoteAndMenu(ctx);
      }
      return true;
    }

    if (this.getSceneData(ctx).editMode?.customSlippage && text) {
      const sceneData = this.getSceneData(ctx);
      // Validar que el slippage esté entre 1 y 50
      const slippageNum = parseFloat(text);
      const validationResult = BuyAmountValidator.validate(text, false);

      // Guardar el messageId del usuario en el array temporal
      if (ctx.message?.message_id) {
        sceneData.tempCustomSlippageMessageIds =
          sceneData.tempCustomSlippageMessageIds || [];
        sceneData.tempCustomSlippageMessageIds.push(ctx.message.message_id);
      }

      if (validationResult.isValid && slippageNum >= 1 && slippageNum <= 50) {
        // Establecer el custom slippage y también como selectedSlippage
        sceneData.customSlippage = text;
        sceneData.selectedSlippage = text; // Importante: establecer también selectedSlippage

        // Borrar TODOS los mensajes temporales acumulados
        if (
          sceneData.tempCustomSlippageMessageIds &&
          sceneData.tempCustomSlippageMessageIds.length > 0
        ) {
          for (const msgId of sceneData.tempCustomSlippageMessageIds) {
            try {
              await ctx.deleteMessage(msgId);
            } catch (error) {
              this.log(
                "debug",
                ctx,
                `Could not delete message ${msgId}: ${error}`
              );
            }
          }
        }

        sceneData.editMode = {
          customAmount: false,
          customSlippage: false,
        };
        sceneData.tempCustomSlippageMessageIds = []; // Limpiar array
        this.updateSceneData(ctx, sceneData);

        this.log("info", ctx, `Custom slippage set: ${text}%`);
      } else {
        // Valor inválido: mostrar error y guardar su messageId
        const errorMessage = await ctx.reply(
          "❌ Slippage must be between 1 and 50"
        );
        sceneData.tempCustomSlippageMessageIds =
          sceneData.tempCustomSlippageMessageIds || [];
        sceneData.tempCustomSlippageMessageIds.push(errorMessage.message_id);

        const retryMessage = await this.menus.askCustomSlippageMenu(ctx);
        if (retryMessage) {
          sceneData.tempCustomSlippageMessageIds.push(retryMessage);
        }
        this.updateSceneData(ctx, sceneData);
      }

      // Solo mostrar trade menu si la validación fue exitosa
      if (validationResult.isValid && slippageNum >= 1 && slippageNum <= 50) {
        await this.menus.showTradeMenu(ctx, sceneData, sceneData.menuMessageId);
      }
      return true;
    }

    return false;
  }

  private resetSceneData(ctx: GlobalSceneContext): void {
    const sceneData = this.getSceneData(ctx);
    // Reset any temporary data if needed
    this.updateSceneData(ctx, sceneData);
  }

  /**
   * Helper function to refresh the bestDex quote and update the menu
   */
  private async refreshQuoteAndMenu(ctx: GlobalSceneContext): Promise<void> {
    try {
      const sceneData = this.getSceneData(ctx);

      // Get updated best dex quote
      const bestDex = await this.service.getBestDex(ctx, sceneData);
      if (bestDex) {
        sceneData.bestDex = bestDex.best;
        this.updateSceneData(ctx, sceneData);

        // Update the menu with new quote
        await this.menus.showTradeMenu(ctx, sceneData, sceneData.menuMessageId);

        this.log("info", ctx, "Quote refreshed successfully");
      }
    } catch (error) {
      this.log("error", ctx, `Error refreshing quote: ${error}`);
      // Could show an error message to user if needed
    }
  }
}
