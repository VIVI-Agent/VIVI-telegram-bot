import { GENERIC_ERRORS } from "@texts";
import { BaseSubScene, GlobalSceneContext, TradeSceneData } from "../../types";
import { TradeMenus } from "./TradeMenus";
import { TradeService } from "./TradeService";
import { CB } from "./callbacks";
import { TRADE_TEXTS } from "./messages";
import { AddressValidator, BuyAmountValidator } from "@utils";
import { bigint } from "zod";
import {
  TokenInfoServiceWithCache,
  tokenInfoUpdateEmitter,
  TokenInfoUpdateEvent,
} from "@blockchain";
import { Address } from "viem";

export class TradeSubScene extends BaseSubScene<TradeSceneData> {
  private menus: TradeMenus;
  private service: TradeService;
  private tokenInfoService: TokenInfoServiceWithCache;
  private tokenInfoListener?: (event: TokenInfoUpdateEvent) => void;

  constructor(instanceId: string) {
    super(instanceId, "Trade");
    this.menus = new TradeMenus(instanceId);
    this.service = new TradeService(instanceId);
    this.tokenInfoService = new TokenInfoServiceWithCache();
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
          try {
            const token = await this.service.findToken(ctx, data.token);
            if (token) {
              // Set token data
              sceneData.token = token;
              sceneData.state =
                data.mode === "buy" ? "trade_buy" : "trade_sell";

              // Load token info from cache
              await this.loadTokenInfoWithCache(
                ctx,
                token.address as Address,
                sceneData
              );

              this.updateSceneData(ctx, sceneData);
            } else {
              // Handle error or invalid token address
              await ctx.reply(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
              await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
              return;
            }
          } catch (error) {
            this.log("error", ctx, `Error finding token: ${error}`);
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

            // Get best dex for buy mode after wallets are selected
            const bestDex = await this.service.getBestDex(ctx, sceneData);
            if (bestDex) {
              sceneData.bestDex = bestDex.best;
            }
          } else if (sceneData.state === "trade_sell") {
            sceneData.selectedAmount =
              sceneData.userWithSettings.sellSettings?.amount1?.toString();
            sceneData.selectedSlippage =
              sceneData.userWithSettings.sellSettings?.slippage?.toString();
            this.updateSceneData(ctx, sceneData);

            // Check if user has any tokens to sell
            let hasAnyTokens = false;
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
                hasAnyTokens = true;
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

            // Get best dex for sell mode if we have tokens to sell
            if (hasAnyTokens) {
              const bestDex = await this.service.getBestDex(ctx, sceneData);
              if (bestDex) {
                sceneData.bestDex = bestDex.best;
              }
            }

            // If no tokens to sell, switch to buy mode
            if (!hasAnyTokens) {
              this.log(
                "info",
                ctx,
                `No ${sceneData.token?.symbol} tokens found in wallets, switching to buy mode`
              );

              // Switch to buy mode
              sceneData.state = "trade_buy";
              sceneData.selectedAmount =
                sceneData.userWithSettings.buySettings?.amount1?.toString();
              sceneData.selectedSlippage =
                sceneData.userWithSettings.buySettings?.slippage?.toString();
              sceneData.selectedWallets = [];

              // Auto-select wallets with enough ETH for buy
              const ethAmount =
                sceneData.userWithSettings.buySettings?.amount1 ?? 0.01;
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
                }
              }

              this.log(
                "info",
                ctx,
                `Switched to buy mode, selected wallets: ${sceneData.selectedWallets}`
              );

              // Get best dex for the switched buy mode
              const bestDex = await this.service.getBestDex(ctx, sceneData);
              if (bestDex) {
                sceneData.bestDex = bestDex.best;
              }
            }
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

        case CB.SWITCH_TO_SELL:
          await ctx.answerCbQuery();
          await this.switchMode(ctx, "trade_sell");
          return true;

        case CB.SWITCH_TO_BUY:
          await ctx.answerCbQuery();
          await this.switchMode(ctx, "trade_buy");
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

        case CB.SELECT_PERCENTAGE:
          await ctx.answerCbQuery();
          if (params && params[0]) {
            // if params[0] is "custom", set sceneData.editMode.customAmount to true
            // call menu to ask for custom percentage using askCustomPercentageMenu
            if (params[0] === "custom") {
              sceneData.editMode = {
                customAmount: true, // Reutilizamos customAmount para custom percentage
                customSlippage: false,
              };
              // Inicializar array para messageIds temporales
              sceneData.tempCustomPercentageMessageIds = [];
              this.updateSceneData(ctx, sceneData);
              const customPercentageMessageId =
                await this.menus.askCustomPercentageMenu(ctx);
              if (customPercentageMessageId) {
                // Guardar el messageId inicial del bot
                sceneData.tempCustomPercentageMessageIds.push(
                  customPercentageMessageId
                );
                this.updateSceneData(ctx, sceneData);
              }
            } else {
              // Seleccionar un porcentaje predefinido
              const percentage = params[0];
              sceneData.selectedAmount = percentage;
              sceneData.editMode = {
                customAmount: false,
                customSlippage: false,
              };
              // Limpiar datos de custom percentage cuando se selecciona un predefinido
              sceneData.customAmount = undefined;
              sceneData.tempCustomPercentageMessageIds = [];
              this.updateSceneData(ctx, sceneData);

              // Refresh quote with new percentage and update menu
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

        // Trade actions
        case CB.BUY_TOKEN:
          try {
            await ctx.answerCbQuery();
            const selectedWallets = sceneData.selectedWallets;
            const userId = ctx.user.id;

            await this.menus.showTradeMenu(ctx, sceneData, messageId, true);

            const instantReply = await ctx.reply(
              `⏳ Processing Buy Tx ${sceneData.token?.symbol}...\n`
            );

            const results = await Promise.allSettled(
              selectedWallets?.map((wid) =>
                this.service.buyToken(
                  ctx,
                  sceneData,
                  wid,
                  userId,
                  this.createTransactionSuccessCallback(ctx, "buy")
                )
              ) || []
            );
            await ctx.deleteMessage(instantReply.message_id);
          } catch (error) {
            this.log("error", ctx, `Error buying token: ${error}`);
          }
          return true;

        case CB.SELL_TOKEN:
          try {
            await ctx.answerCbQuery();
            const selectedWallets = sceneData.selectedWallets;
            const userId = ctx.user.id;
            await this.menus.showTradeMenu(ctx, sceneData, messageId, true);

            const instantReply = await ctx.reply(
              `⏳ Processing Sell Tx ${sceneData.token?.symbol}...\n`
            );

            const results = await Promise.allSettled(
              selectedWallets?.map((wid) =>
                this.service.sellToken(
                  ctx,
                  sceneData,
                  wid,
                  userId,
                  this.createTransactionSuccessCallback(ctx, "sell")
                )
              ) || []
            );

            await ctx.deleteMessage(instantReply.message_id);
          } catch (error) {
            this.log("error", ctx, `Error selling token: ${error}`);
          }
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

            // Load token info from cache
            await this.loadTokenInfoWithCache(ctx, tokenAddress, sceneData);

            // Load user settings and wallets with holdings
            const [userWithSettings, wallets] = await Promise.all([
              this.service.getUserWithSettings(ctx),
              this.service.getUserWalletsWithHolding(ctx, token.id),
            ]);

            if (userWithSettings && wallets) {
              sceneData.userWithSettings = userWithSettings;
              sceneData.userWithWallets = wallets;

              // Set default amount and slippage for buy mode
              sceneData.selectedAmount =
                userWithSettings.buySettings?.amount1?.toString();
              sceneData.selectedSlippage =
                userWithSettings.buySettings?.slippage?.toString();

              // Auto-select wallets with enough ETH for buy
              const ethAmount = userWithSettings.buySettings?.amount1 ?? 0.01;
              const ethAmountInWei = BigInt(Math.floor(ethAmount * 10 ** 18));
              sceneData.selectedWallets = [];

              for (const wallet of wallets.wallets) {
                if (wallet.balance && BigInt(wallet.balance) > ethAmountInWei) {
                  sceneData.selectedWallets.push(wallet.id);
                  this.log(
                    "info",
                    ctx,
                    `Wallet ${wallet.id} has enough ETH: ${
                      wallet.balance
                    } Wei > ${ethAmountInWei.toString()} Wei`
                  );
                }
              }

              // Get best dex quote
              const bestDex = await this.service.getBestDex(ctx, sceneData);
              if (bestDex) {
                sceneData.bestDex = bestDex.best;
              }

              this.updateSceneData(ctx, sceneData);

              const userMessageId = ctx.message?.message_id;
              if (userMessageId) {
                await ctx.deleteMessage(userMessageId);
              }
              // Show trade menu with all data loaded
              const menuMessageId = await this.menus.showTradeMenu(
                ctx,
                sceneData,
                this.getSceneData(ctx).menuMessageId!
              );
              if (menuMessageId) {
                sceneData.menuMessageId = menuMessageId;
                this.updateSceneData(ctx, sceneData);
              }

              this.log(
                "info",
                ctx,
                `Selected wallets for buy: ${sceneData.selectedWallets}`
              );
              return true;
            }
          }
        }
        const userMessageId = ctx.message?.message_id;
        if (userMessageId) {
          await ctx.deleteMessage(userMessageId);
        }

        this.menus.askForTokenMenuAgain(
          ctx,
          this.getSceneData(ctx).menuMessageId!
        );
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND
        ) {
          const userMessageId = ctx.message?.message_id;
          if (userMessageId) {
            await ctx.deleteMessage(userMessageId);
          }
          this.menus.askForTokenMenuAgain(
            ctx,
            this.getSceneData(ctx).menuMessageId!
          );
        } else {
          ctx.reply(GENERIC_ERRORS.OLD_VERSION);
        }
        return true;
      }
    }
    if (this.getSceneData(ctx).editMode?.customAmount && text) {
      const sceneData = this.getSceneData(ctx);

      // Check if we're in sell mode (custom percentage) or buy mode (custom amount)
      if (sceneData.state === "trade_sell") {
        // Handle custom percentage for sell mode
        const normalizedText = this.normalizeNumberInput(text);
        // For sell mode, only take the integer part of the percentage
        const percentageNum = parseInt(normalizedText);
        const isValidPercentage =
          !isNaN(percentageNum) && percentageNum >= 1 && percentageNum <= 100;

        // Guardar el messageId del usuario en el array temporal
        if (ctx.message?.message_id) {
          sceneData.tempCustomPercentageMessageIds =
            sceneData.tempCustomPercentageMessageIds || [];
          sceneData.tempCustomPercentageMessageIds.push(ctx.message.message_id);
        }

        if (isValidPercentage) {
          // Establecer el custom percentage y también como selectedAmount
          // For sell mode, store only the integer part
          const integerPercentage = percentageNum.toString();
          sceneData.customAmount = integerPercentage;
          sceneData.selectedAmount = integerPercentage; // Importante: establecer también selectedAmount

          // Borrar TODOS los mensajes temporales acumulados
          if (
            sceneData.tempCustomPercentageMessageIds &&
            sceneData.tempCustomPercentageMessageIds.length > 0
          ) {
            for (const msgId of sceneData.tempCustomPercentageMessageIds) {
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
          sceneData.tempCustomPercentageMessageIds = []; // Limpiar array
          this.updateSceneData(ctx, sceneData);

          this.log("info", ctx, `Custom percentage set: ${text}%`);

          // Refrescar quote y mostrar menu
          await this.refreshQuoteAndMenu(ctx);
        } else {
          // Valor inválido: mostrar error y guardar su messageId
          const errorMessage = await ctx.reply(
            "❌ Percentage must be between 1 and 100. Please try again."
          );
          sceneData.tempCustomPercentageMessageIds =
            sceneData.tempCustomPercentageMessageIds || [];
          sceneData.tempCustomPercentageMessageIds.push(
            errorMessage.message_id
          );

          const retryMessage = await this.menus.askCustomPercentageMenu(ctx);
          if (retryMessage) {
            sceneData.tempCustomPercentageMessageIds.push(retryMessage);
          }
          this.updateSceneData(ctx, sceneData);
        }
      } else {
        // Handle custom amount for buy mode
        const normalizedText = this.normalizeNumberInput(text);
        const validationResult = BuyAmountValidator.validate(
          normalizedText,
          false
        );

        // Guardar el messageId del usuario en el array temporal
        if (ctx.message?.message_id) {
          sceneData.tempCustomAmountMessageIds =
            sceneData.tempCustomAmountMessageIds || [];
          sceneData.tempCustomAmountMessageIds.push(ctx.message.message_id);
        }

        if (validationResult.isValid) {
          // Establecer el custom amount y también como selectedAmount
          sceneData.customAmount = normalizedText;
          sceneData.selectedAmount = normalizedText; // Importante: establecer también selectedAmount

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

          // Refrescar quote y mostrar menu
          await this.refreshQuoteAndMenu(ctx);
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
      }

      return true;
    }

    if (this.getSceneData(ctx).editMode?.customSlippage && text) {
      const sceneData = this.getSceneData(ctx);
      // Validar que el slippage esté entre 1 y 50
      const normalizedText = this.normalizeNumberInput(text);
      const slippageNum = parseFloat(normalizedText);
      const validationResult = BuyAmountValidator.validate(
        normalizedText,
        false
      );

      // Guardar el messageId del usuario en el array temporal
      if (ctx.message?.message_id) {
        sceneData.tempCustomSlippageMessageIds =
          sceneData.tempCustomSlippageMessageIds || [];
        sceneData.tempCustomSlippageMessageIds.push(ctx.message.message_id);
      }

      if (validationResult.isValid && slippageNum >= 1 && slippageNum <= 50) {
        // Establecer el custom slippage y también como selectedSlippage
        sceneData.customSlippage = normalizedText;
        sceneData.selectedSlippage = normalizedText; // Importante: establecer también selectedSlippage

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
   * Helper function to normalize number input (convert commas to dots)
   */
  private normalizeNumberInput(text: string): string {
    return text.replace(/,/g, ".");
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

  /**
   * Public method to create transaction success callback
   */
  public createTransactionSuccessCallback(
    ctx: GlobalSceneContext,
    transactionType: "buy" | "sell"
  ): () => Promise<void> {
    return async () => {
      await this.handleTransactionSuccess(ctx, transactionType);
    };
  }

  /**
   * Handle automatic mode switch after successful transaction
   */
  private async handleTransactionSuccess(
    ctx: GlobalSceneContext,
    transactionType: "buy" | "sell"
  ): Promise<void> {
    try {
      this.log(
        "info",
        ctx,
        `Transaction ${transactionType} completed successfully, switching mode`
      );

      const sceneData = this.getSceneData(ctx);

      // Wait a moment to ensure all balance updates are complete
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Refresh user data with updated balances
      const [userWithSettings, wallets] = await Promise.all([
        this.service.getUserWithSettings(ctx),
        this.service.getUserWalletsWithHolding(ctx, sceneData.token?.id!),
      ]);

      if (userWithSettings && wallets) {
        sceneData.userWithSettings = userWithSettings;
        sceneData.userWithWallets = wallets;

        // Switch to opposite mode
        const newMode = transactionType === "buy" ? "trade_sell" : "trade_buy";
        await this.switchMode(ctx, newMode);

        this.log(
          "info",
          ctx,
          `Successfully switched to ${newMode} mode after ${transactionType}`
        );
      }
    } catch (error) {
      this.log("error", ctx, `Error handling transaction success: ${error}`);
    }
  }

  /**
   * Switch between buy and sell modes
   */
  private async switchMode(
    ctx: GlobalSceneContext,
    newMode: "trade_buy" | "trade_sell"
  ): Promise<void> {
    try {
      const sceneData = this.getSceneData(ctx);
      sceneData.state = newMode;
      sceneData.selectedWallets = []; // Reset selected wallets

      // Reset custom values when switching modes
      sceneData.customAmount = undefined;
      sceneData.customSlippage = undefined;
      sceneData.editMode = {
        customAmount: false,
        customSlippage: false,
      };

      // Clean up temporary message arrays
      sceneData.tempCustomAmountMessageIds = [];
      sceneData.tempCustomPercentageMessageIds = [];
      sceneData.tempCustomSlippageMessageIds = [];

      // Set appropriate amounts and slippage for the new mode
      if (newMode === "trade_buy") {
        sceneData.selectedAmount =
          sceneData.userWithSettings?.buySettings?.amount1?.toString();
        sceneData.selectedSlippage =
          sceneData.userWithSettings?.buySettings?.slippage?.toString();

        // Auto-select wallets with enough ETH for buy
        const ethAmount =
          sceneData.userWithSettings?.buySettings?.amount1 ?? 0.01;
        const ethAmountInWei = BigInt(Math.floor(ethAmount * 10 ** 18));

        for (const wallet of sceneData.userWithWallets?.wallets || []) {
          if (wallet.balance && BigInt(wallet.balance) > ethAmountInWei) {
            sceneData.selectedWallets?.push(wallet.id);
          }
        }
      } else {
        sceneData.selectedAmount =
          sceneData.userWithSettings?.sellSettings?.amount1?.toString();
        sceneData.selectedSlippage =
          sceneData.userWithSettings?.sellSettings?.slippage?.toString();

        // Auto-select wallets with both ETH and tokens for sell
        for (const wallet of sceneData.userWithWallets?.wallets || []) {
          const hasEthBalance =
            wallet.balance && BigInt(wallet.balance) > BigInt(0);
          const hasTokenBalance =
            wallet.holdings &&
            wallet.holdings.balance &&
            BigInt(wallet.holdings.balance) > BigInt(0);

          if (hasEthBalance && hasTokenBalance) {
            sceneData.selectedWallets?.push(wallet.id);
          }
        }
      }

      this.updateSceneData(ctx, sceneData);

      // Refresh quote and update menu
      await this.refreshQuoteAndMenu(ctx);

      this.log("info", ctx, `Switched to ${newMode} mode`);
    } catch (error) {
      this.log("error", ctx, `Error switching mode: ${error}`);
    }
  }

  /**
   * Load token info from cache and setup background updates
   */
  private async loadTokenInfoWithCache(
    ctx: GlobalSceneContext,
    tokenAddress: Address,
    sceneData: TradeSceneData
  ): Promise<void> {
    try {
      this.log("info", ctx, `Loading token info for ${tokenAddress}`);

      // 🔄 **STEP 1: Load from cache immediately**
      const cacheResult = await this.tokenInfoService.getTokenInfoWithCache(
        ctx,
        tokenAddress
      );

      // Set cached data immediately (or null if no cache)
      sceneData.externalTokenInfo = cacheResult.data;
      this.log(
        "info",
        ctx,
        `Token info loaded from ${
          cacheResult.isFromCache ? "cache" : "fresh"
        }: ${cacheResult.data ? "available" : "N/A"}`
      );

      // 🎯 **STEP 2: Subscribe to token info updates for this instance**
      this.setupTokenInfoListener(ctx, tokenAddress);

      // 🚀 **STEP 3: Trigger background update if needed**
      this.log(
        "debug",
        ctx,
        `Token info cache check - needsUpdate: ${cacheResult.needsUpdate}, isFromCache: ${cacheResult.isFromCache}`
      );

      if (cacheResult.needsUpdate || !cacheResult.isFromCache) {
        this.log(
          "info",
          ctx,
          `Token info needs update, triggering background refresh for ${tokenAddress} (needsUpdate: ${cacheResult.needsUpdate}, isFromCache: ${cacheResult.isFromCache})`
        );

        // Start background update (don't await - let it run async)
        setImmediate(async () => {
          try {
            this.log(
              "info",
              ctx,
              `Starting background token info update for ${tokenAddress}`
            );
            await this.tokenInfoService.updateTokenInfoCacheInBackground(
              ctx,
              tokenAddress
            );
            this.log(
              "info",
              ctx,
              `Completed background token info update for ${tokenAddress}`
            );
          } catch (error) {
            this.log(
              "error",
              ctx,
              `Background token info update failed for ${tokenAddress}: ${error}`
            );
          }
        });
      } else {
        this.log(
          "debug",
          ctx,
          `Token info cache is fresh, no update needed for ${tokenAddress}`
        );
      }
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error loading token info for ${tokenAddress}: ${error}`
      );
      // Set null on error
      sceneData.externalTokenInfo = null;
    }
  }

  /**
   * Setup token info listener for this scene instance
   */
  private setupTokenInfoListener(
    ctx: GlobalSceneContext,
    tokenAddress: Address
  ): void {
    try {
      // Remove any existing listener
      this.cleanupTokenInfoListener();

      // Subscribe this instance to token info updates
      tokenInfoUpdateEmitter.subscribe(tokenAddress, this.instanceId, "Trade");

      // Create new listener
      this.tokenInfoListener = (event: TokenInfoUpdateEvent) => {
        this.handleTokenInfoUpdate(ctx, event);
      };

      // Register listener for this specific instance
      tokenInfoUpdateEmitter.onInstanceTokenInfoUpdate(
        this.instanceId,
        this.tokenInfoListener
      );

      this.log(
        "info",
        ctx,
        `Token info listener setup for ${tokenAddress} on instance ${this.instanceId}`
      );
    } catch (error) {
      this.log("error", ctx, `Error setting up token info listener: ${error}`);
    }
  }

  /**
   * Handle token info update events
   */
  private async handleTokenInfoUpdate(
    ctx: GlobalSceneContext,
    event: TokenInfoUpdateEvent
  ): Promise<void> {
    try {
      this.log(
        "info",
        ctx,
        `Received token info update for ${event.tokenAddress} on instance ${event.instanceId}`
      );
      console.log(
        `🚀 [SCENE DEBUG] 📬 RECEIVED TOKEN INFO UPDATE FOR ${event.tokenAddress}`
      );

      console.log(`🔍 [SCENE DEBUG] Raw event data for ${event.tokenAddress}:`);
      console.log(
        `   👥 holders: ${event.data.holders} (type: ${typeof event.data
          .holders})`
      );
      console.log(
        `   📊 marketCap: ${event.data.marketCap} (type: ${typeof event.data
          .marketCap})`
      );
      console.log(
        `   📜 totalSupply: ${event.data.totalSupply} (type: ${typeof event.data
          .totalSupply})`
      );
      console.log(
        `   🌐 website: ${event.data.website} (type: ${typeof event.data
          .website})`
      );
      console.log(
        `   📱 telegramLink: ${event.data.telegramLink} (type: ${typeof event
          .data.telegramLink})`
      );
      console.log(
        `   🐦 twitterLink: ${event.data.twitterLink} (type: ${typeof event.data
          .twitterLink})`
      );
      console.log(`   📅 timestamp: ${event.timestamp}`);

      // 🛡️ **PROTECTION: Verify this scene is still active and event is for this instance**
      const sceneState = ctx.session.activeSubScenes[this.instanceId];
      if (
        !sceneState ||
        !sceneState.active ||
        event.instanceId !== this.instanceId
      ) {
        this.log(
          "debug",
          ctx,
          `Ignoring token info update - scene not active or wrong instance`
        );
        return;
      }

      const sceneData = this.getSceneData(ctx);

      // 🛡️ **PROTECTION: Verify we're still trading the same token**
      if (
        !sceneData.token ||
        sceneData.token.address.toLowerCase() !==
          event.tokenAddress.toLowerCase()
      ) {
        this.log(
          "debug",
          ctx,
          `Ignoring token info update - token address mismatch`
        );
        return;
      }

      // 🛡️ **PROTECTION: Verify menu message still exists**
      if (!sceneData.menuMessageId) {
        this.log(
          "debug",
          ctx,
          `Ignoring token info update - no menu message to update`
        );
        return;
      }

      // 📊 **UPDATE: Update scene data with new token info**
      const newTokenInfo = {
        tokenAddress: event.tokenAddress,
        marketCap: event.data.marketCap,
        totalSupply: event.data.totalSupply,
        holders: event.data.holders,
        website: event.data.website,
        telegramLink: event.data.telegramLink,
        twitterLink: event.data.twitterLink,
        isFromCache: false,
        lastUpdated: event.timestamp,
      };

      console.log(
        `💾 [SCENE DEBUG] About to save token info to scene data for ${event.tokenAddress}:`
      );
      console.log(
        `   👥 holders: ${
          newTokenInfo.holders
        } (type: ${typeof newTokenInfo.holders})`
      );
      console.log(
        `   📊 marketCap: ${
          newTokenInfo.marketCap
        } (type: ${typeof newTokenInfo.marketCap})`
      );
      console.log(
        `   📜 totalSupply: ${
          newTokenInfo.totalSupply
        } (type: ${typeof newTokenInfo.totalSupply})`
      );
      console.log(
        `   🌐 website: ${
          newTokenInfo.website
        } (type: ${typeof newTokenInfo.website})`
      );
      console.log(
        `   📱 telegramLink: ${
          newTokenInfo.telegramLink
        } (type: ${typeof newTokenInfo.telegramLink})`
      );
      console.log(
        `   🐦 twitterLink: ${
          newTokenInfo.twitterLink
        } (type: ${typeof newTokenInfo.twitterLink})`
      );

      sceneData.externalTokenInfo = newTokenInfo;
      this.updateSceneData(ctx, sceneData);

      this.log(
        "info",
        ctx,
        `Updated scene data with fresh token info for ${event.tokenAddress}`
      );

      console.log(
        `✅ [SCENE DEBUG] Scene data updated with token info for ${event.tokenAddress}`
      );

      // 🔄 **REFRESH: Update the menu with new token info**
      await this.menus.showTradeMenu(ctx, sceneData, sceneData.menuMessageId);

      this.log(
        "info",
        ctx,
        `Trade menu refreshed with updated token info for ${event.tokenAddress}`
      );
      console.log(
        `🚀 [SCENE DEBUG] 🔄 MENU REFRESHED FOR ${event.tokenAddress} - NEW DATA DISPLAYED!`
      );
    } catch (error) {
      this.log("error", ctx, `Error handling token info update: ${error}`);
    }
  }

  /**
   * Cleanup token info listener
   */
  private cleanupTokenInfoListener(): void {
    if (this.tokenInfoListener) {
      // Remove instance-specific listener
      tokenInfoUpdateEmitter.removeAllInstanceListeners(this.instanceId);

      // Unsubscribe from future updates
      tokenInfoUpdateEmitter.unsubscribe(this.instanceId);

      this.tokenInfoListener = undefined;
    }
  }

  /**
   * Override cleanup to cleanup listeners
   */
  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log(
      "info",
      ctx,
      "Cleaning up Trade scene, cleaning up token info listener"
    );
    this.cleanupTokenInfoListener();
    await super.cleanup(ctx);
  }
}
