import {
  buyToken,
  buyTokenAerodrome,
  buyTokenV3,
  buyTokenVirtualToken,
  buyTokenVIVIApeStore,
  buyTokenZoraMultiHop,
  findOrCreateToken,
  getBestDexForBuyEthToToken,
  getBestDexForSellTokenToEth,
  handleTxNotificationsWithLinks,
} from "@blockchain";
import { BaseService, GlobalSceneContext, TradeSceneData } from "../../types";
import { Address, parseEther, TransactionReceipt } from "viem";
import { AddressValidator, calculateFinalFee } from "@utils";
import { TRADE_TEXTS } from "./messages";
import { publicClientQuickNode } from "@client";
import { FEE_TIERS } from "blockchain/services/const";
import { BuyHandlers } from "./BuyHandlers";

export class TradeService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "TradeService");
  }

  /**
   * Load user trade data
   */
  async findToken(ctx: GlobalSceneContext, tokenAddress: Address) {
    try {
      this.log("info", ctx, `Loading trade data for user: ${ctx.user.id}`);
      this.log("info", ctx, `Token address: ${tokenAddress}`);
      if (!AddressValidator.parseEthereumAddress(tokenAddress)) {
        throw new Error(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
      }

      return await findOrCreateToken(ctx, tokenAddress);
    } catch (error) {
      this.log("error", ctx, `Error loading trade data: ${error}`);
      throw new Error(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
    }
  }

  async getBestDex(ctx: GlobalSceneContext, sceneData: TradeSceneData) {
    try {
      this.log("info", ctx, `Getting best dex for user: ${ctx.user.id}`);
      const token = sceneData.token;
      const tokenAddress = AddressValidator.parseEthereumAddress(
        token?.address!
      );

      if (sceneData.state === "trade_buy" && token) {
        // get best dex for buy eth to token
        const decimalsOut = token.decimals ?? 18;
        const buySettings = sceneData.userWithSettings?.buySettings;

        // Use the selected amount instead of always using amount1
        let ethAmount: number;
        if (sceneData.customAmount) {
          ethAmount = parseFloat(sceneData.customAmount);
        } else if (sceneData.selectedAmount) {
          ethAmount = parseFloat(sceneData.selectedAmount);
        } else {
          ethAmount = buySettings?.amount1 ?? 0.01;
        }

        // Convertir ETH a Wei (multiplicar por 10^18)
        const defaultAmountBN = BigInt(Math.floor(ethAmount * 10 ** 18));

        this.log("info", ctx, `Buy amount in ETH: ${ethAmount}`);
        this.log(
          "info",
          ctx,
          `Buy amount in Wei: ${defaultAmountBN.toString()}`
        );

        const bestResult = await getBestDexForBuyEthToToken({
          publicClient: publicClientQuickNode,
          tokenOut: tokenAddress!,
          decimalsOut,
          feeTiers: FEE_TIERS,
          amountEth: defaultAmountBN,
        });
        return bestResult;
      } else if (sceneData.state === "trade_sell" && token) {
        // get best dex for sell token to eth
        const sellSettings = sceneData.userWithSettings?.sellSettings;
        const percentageAmount = sellSettings?.amount1 || 25; // Porcentaje (1-100)

        // Calcular el balance total de tokens solo en las wallets seleccionadas
        let totalBalance = BigInt(0);
        const selectedWalletIds = sceneData.selectedWallets || [];

        if (
          sceneData.userWithWallets?.wallets &&
          selectedWalletIds.length > 0
        ) {
          for (const wallet of sceneData.userWithWallets.wallets) {
            // Solo incluir wallets que están seleccionadas
            if (
              selectedWalletIds.includes(wallet.id) &&
              wallet.holdings &&
              wallet.holdings.balance
            ) {
              totalBalance += BigInt(wallet.holdings.balance);
              this.log(
                "info",
                ctx,
                `Including wallet ${wallet.id} (${wallet.address}): ${wallet.holdings.balance} tokens`
              );
            }
          }
        }

        this.log("info", ctx, `Tokens all wallets: ${totalBalance.toString()}`);
        this.log("info", ctx, `Sell percentage: ${percentageAmount}%`);

        // Calcular la cantidad proporcional basada en el porcentaje
        const proportionalAmount =
          (totalBalance * BigInt(percentageAmount)) / BigInt(100);

        this.log("info", ctx, `Sell amount: ${proportionalAmount.toString()}`);

        // Verificar que hay wallets seleccionadas
        if (selectedWalletIds.length === 0) {
          throw new Error("No wallets selected for trading");
        }

        // Verificar que tenemos suficiente balance
        if (totalBalance === BigInt(0)) {
          throw new Error(
            `No balance found for token ${
              token.symbol || token.address
            } in selected wallets`
          );
        }

        if (proportionalAmount === BigInt(0)) {
          throw new Error(
            `Calculated amount is 0. Total balance: ${totalBalance.toString()}, Percentage: ${percentageAmount}%`
          );
        }

        const bestResult = await getBestDexForSellTokenToEth({
          publicClient: publicClientQuickNode,
          tokenIn: tokenAddress!,
          feeTiers: FEE_TIERS,
          amountTokenIn: proportionalAmount,
        });
        return bestResult;
      }
    } catch (error) {
      this.log("error", ctx, `Error getting best dex: ${error}`);
      throw new Error(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
    }
  }

  async getUserWithSettings(ctx: GlobalSceneContext) {
    return await ctx.services.userService.getUserWithSettings(ctx.user.id);
  }

  async getUserWalletsWithHolding(ctx: GlobalSceneContext, tokenId: number) {
    return await ctx.services.userService.getUserWalletsWithHolding(
      ctx.user.id,
      tokenId
    );
  }

  /**
   * Execute buy order
   */
  async buyToken(
    ctx: GlobalSceneContext,
    sceneData: TradeSceneData,
    walletId: number,
    userId: number
  ) {
    try {
      this.log("info", ctx, `Buying token for user: ${userId}`);
      this.log("info", ctx, `Wallet ID: ${walletId}`);
      this.log("info", ctx, `Token: ${sceneData.token?.symbol}`);
      this.log("info", ctx, `Token address: ${sceneData.token?.address}`);
      this.log("info", ctx, `Amount: ${sceneData.selectedAmount}`);
      this.log("info", ctx, `Slippage: ${sceneData.selectedSlippage}`);
      this.log("info", ctx, `Best Dex: ${sceneData.bestDex?.dexName}`);
      const token = sceneData.token;
      const tokenAddress = AddressValidator.parseEthereumAddress(
        token?.address!
      );
      const amountEth = parseEther(sceneData.selectedAmount!);
      const slippage = Number(sceneData.selectedSlippage) || 50;
      const bestDex = sceneData.bestDex;

      const feePercent = await calculateFinalFee(
        ctx,
        token!.address as Address,
        userId
      );

      let txHash: `0x${string}`;
      let waitReceipt: Promise<TransactionReceipt>;

      if (bestDex?.dexName === "UniswapV2") {
        const swapRes = await buyToken({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          amountEth,
          slippagePercent: slippage,
          bestDex: bestDex, // Pasar bestDex al servicio
          feePercent,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        // Build parseLogs y onMined
        const { parseLogsFn, onMinedFn } = BuyHandlers.buildUniV2BuyHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash
        );
        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Buy",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (
        bestDex?.dexName === "AerodromeVolatile" ||
        bestDex?.dexName === "AerodromeStable"
      ) {
        const stable = bestDex?.dexName === "AerodromeStable";
        const swapRes = await buyTokenAerodrome({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          amountEth,
          slippagePercent: slippage,
          feePercent,
          bestDex: bestDex, // Pasar bestDex al servicio
          stable,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn, onMinedFn } = BuyHandlers.buildAeroBuyHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash
        );
        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Buy",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "UniswapV3") {
        const tier = bestDex?.feeTier || 3000;
        const swapRes = await buyTokenV3({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          amountEth,
          feePercent,
          feeTier: tier,
          bestDex: bestDex, // Pasar bestDex al servicio
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn, onMinedFn } = BuyHandlers.buildUniV3BuyHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash
        );
        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Buy",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "ZoraMultiHop") {
        const swapRes = await buyTokenZoraMultiHop({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          amountEth,
          slippagePercent: slippage,
          feePercent,
          bestDex: bestDex, // Pasar bestDex al servicio
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn, onMinedFn } = BuyHandlers.buildZoraBuyHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash
        );
        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Buy",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "ApeStore") {
        const swapRes = await buyTokenVIVIApeStore({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          amountEth,
          slippagePercent: slippage,
          feePercent,
          bestDex: bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn, onMinedFn } = BuyHandlers.buildApeStoreBuyHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash
        );
        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Buy",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "VirtualToken") {
        const swapRes = await buyTokenVirtualToken({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          amountEth,
          slippagePercent: slippage,
          feePercent,
          bestDex: bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn, onMinedFn } =
          BuyHandlers.buildVirtualTokenBuyHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash
          );
        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Buy",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else {
        throw new Error(TRADE_TEXTS.ERRORS.NO_POOL);
      }
    } catch (error) {
      this.log("error", ctx, `Error buying token: ${error}`);
      console.log(error);
      throw error;
    }
  }
}
