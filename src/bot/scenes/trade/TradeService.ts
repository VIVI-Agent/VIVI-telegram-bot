import {
  buyToken,
  buyTokenAerodrome,
  buyTokenV3,
  buyTokenVirtualToken,
  buyTokenVIVIApeStore,
  buyTokenZoraMultiHop,
  buyTokenV4,
  sellToken,
  sellTokenAerodrome,
  sellTokenV3,
  sellTokenVirtualToken,
  sellTokenVIVIApeStore,
  sellTokenZoraMultiHop,
  sellTokenV4,
  findOrCreateToken,
  getBestDexForBuyEthToToken,
  getBestDexForSellTokenToEth,
  handleTxNotificationsWithLinks,
  getWalletBalance,
} from "@blockchain";
import { getTokenBalance } from "@blockchain";
import { BaseService, GlobalSceneContext, TradeSceneData } from "../../types";
import { Address, parseEther, TransactionReceipt } from "viem";
import { AddressValidator, calculateFinalFee } from "@utils";
import { TRADE_TEXTS } from "./messages";
import { publicClientDRPC, publicClientQuickNode } from "@client";
import { FEE_TIERS } from "blockchain/services/const";
import { BuyHandlers } from "./BuyHandlers";
import { SellHandlers } from "./SellHandlers";
import { WalletWithHoldings } from "@domain";
import { ERC20_ABI } from "abis/erc20/erc20";

export class TradeService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "TradeService");
  }

  public async handleRefreshFull(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("info", ctx, "Refreshing menu");

    try {
      // Load fresh user data

      const wallets =
        await ctx.services.walletService.getUserWalletsWithHoldings(
          ctx.user.id
        );

      if (!wallets) {
        this.log("warn", ctx, "Failed to load user data");
        await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
        return false;
      }

      // Process all wallets in parallel
      await Promise.all(
        wallets.map(async (wallet: WalletWithHoldings) => {
          try {
            // Update ETH balance
            const ethBalance = await getWalletBalance(
              wallet.address as Address
            );

            await ctx.services.walletService.updateWalletBalance(
              wallet.id,
              ethBalance
            );

            const holdings = wallet.holdings;

            if (holdings && holdings.length > 0) {
              // Build multicall for all token balances in this wallet
              const contracts = holdings.map((holding) => ({
                address: (
                  holding.token.address as string
                ).toLowerCase() as Address,
                abi: ERC20_ABI,
                functionName: "balanceOf" as const,
                args: [wallet.address as Address],
              }));

              try {
                const results = await publicClientDRPC.multicall({
                  allowFailure: true,
                  contracts,
                });

                for (let i = 0; i < holdings.length; i++) {
                  const res = results[i] as any;
                  const holding = holdings[i];
                  if (!res || res.status !== "success") {
                    continue;
                  }
                  const currentBalance = res.result as bigint;
                  const previousBalance = BigInt(holding.balance ?? "0");
                  if (currentBalance !== previousBalance) {
                    try {
                      await ctx.services.holdingService.updateHoldingFromChain({
                        userId: ctx.user.id,
                        tokenId: holding.token.id,
                        walletId: wallet.id,
                        newBalance: currentBalance,
                      });
                    } catch (err) {
                      this.logError(
                        ctx,
                        "handleRefresh:updateHoldingFromChain",
                        err
                      );
                    }
                  }
                }
              } catch (err) {
                this.logError(ctx, "handleRefresh:multicall", err);
              }
            }
          } catch (err) {
            this.logError(ctx, "handleRefresh", err);
            // Continue with other wallets even if one fails
          }
        })
      );

      try {
        await ctx.answerCbQuery("✅ Balance refreshed!");
      } catch (cbError) {
        // Ignore callback query errors in error handling
      }
      return true;
    } catch (error) {
      this.logError(ctx, "handleRefresh", error);
      await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
      return false;
    }
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

        // Get number of selected wallets to calculate total amount
        const selectedWalletIds = sceneData.selectedWallets || [];
        const numberOfWallets = selectedWalletIds.length;

        // Calculate total amount in wei precisely: parse per-wallet to wei and multiply by number of wallets (>=1)
        const perWalletWei = parseEther(ethAmount.toString());
        const walletsCount = numberOfWallets > 0 ? numberOfWallets : 1;
        const totalAmountBN = perWalletWei * BigInt(walletsCount);

        this.log("info", ctx, `Buy amount per wallet in ETH: ${ethAmount}`);
        this.log("info", ctx, `Number of selected wallets: ${numberOfWallets}`);
        this.log(
          "info",
          ctx,
          `Total buy amount in Wei: ${totalAmountBN.toString()}`
        );

        const bestResult = await getBestDexForBuyEthToToken({
          publicClient: publicClientQuickNode,
          tokenOut: tokenAddress!,
          decimalsOut,
          feeTiers: FEE_TIERS,
          amountEth: totalAmountBN,
        });
        return bestResult;
      } else if (sceneData.state === "trade_sell" && token) {
        // get best dex for sell token to eth
        const sellSettings = sceneData.userWithSettings?.sellSettings;
        const percentageAmount =
          Number(sceneData.selectedAmount) ||
          (sellSettings
            ? Math.max(
                sellSettings.amount1 || 0,
                sellSettings.amount2 || 0,
                sellSettings.amount3 || 0
              )
            : 25); // Use highest percentage as fallback

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
    userId: number,
    onTransactionSuccess?: () => Promise<void>
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
          txHash,
          undefined, // isGroup
          onTransactionSuccess
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
          txHash,
          undefined, // isGroup
          onTransactionSuccess
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
          txHash,
          undefined, // isGroup
          onTransactionSuccess
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
          txHash,
          undefined, // isGroup
          onTransactionSuccess
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
          txHash,
          undefined, // isGroup
          onTransactionSuccess
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
            txHash,
            undefined, // isGroup
            onTransactionSuccess
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
      } else if (bestDex?.dexName === "UniswapV4") {
        const swapRes = await buyTokenV4({
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
          BuyHandlers.buildUniswapV4BuyHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash,
            undefined, // isGroup
            onTransactionSuccess
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

  /**
   * Execute sell order
   */
  async sellToken(
    ctx: GlobalSceneContext,
    sceneData: TradeSceneData,
    walletId: number,
    userId: number,
    onTransactionSuccess?: () => Promise<void>
  ) {
    try {
      this.log("info", ctx, `Selling token for user: ${userId}`);
      this.log("info", ctx, `Wallet ID: ${walletId}`);
      this.log("info", ctx, `Token: ${sceneData.token?.symbol}`);
      this.log("info", ctx, `Token address: ${sceneData.token?.address}`);
      this.log("info", ctx, `Percentage: ${sceneData.selectedAmount}%`);
      this.log("info", ctx, `Slippage: ${sceneData.selectedSlippage}`);
      this.log("info", ctx, `Best Dex: ${sceneData.bestDex?.dexName}`);

      const token = sceneData.token;
      const tokenAddress = AddressValidator.parseEthereumAddress(
        token?.address!
      );
      const slippage = Number(sceneData.selectedSlippage) || 50;
      const bestDex = sceneData.bestDex;
      const percentage = Number(sceneData.selectedAmount) || 25;

      const feePercent = await calculateFinalFee(
        ctx,
        token!.address as Address,
        userId
      );

      // Get wallet with holdings
      const walletWithHoldings =
        await ctx.services.walletService.getWalletWithHoldings(walletId);
      if (!walletWithHoldings) {
        throw new Error(`Wallet ${walletId} not found`);
      }

      // Find the specific holding for this token
      const holding = walletWithHoldings.holdings.find(
        (h) => h.tokenId === token!.id
      );

      if (
        !holding ||
        !holding.balance ||
        BigInt(holding.balance) === BigInt(0)
      ) {
        throw new Error(`No tokens to sell in wallet ${walletId}`);
      }

      // Calculate amount to sell based on percentage
      const totalBalance = BigInt(holding.balance);
      const tokenAmount = (totalBalance * BigInt(percentage)) / BigInt(100);

      if (tokenAmount === BigInt(0)) {
        throw new Error(`Calculated sell amount is 0 for ${percentage}%`);
      }

      this.log(
        "info",
        ctx,
        `Selling ${tokenAmount} tokens (${percentage}% of ${totalBalance})`
      );

      let txHash: `0x${string}`;
      let waitReceipt: Promise<TransactionReceipt>;

      if (bestDex?.dexName === "UniswapV2") {
        const swapRes = await sellToken({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          slippagePercent: slippage,
          feePercent,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn, onMinedFn } = SellHandlers.buildUniV2SellHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash,
          undefined, // isGroup
          onTransactionSuccess
        );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn,
          onMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (
        bestDex?.dexName === "AerodromeVolatile" ||
        bestDex?.dexName === "AerodromeStable"
      ) {
        const stable = bestDex?.dexName === "AerodromeStable";
        const swapRes = await sellTokenAerodrome({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          slippagePercent: slippage,
          feePercent,
          stable,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn: aeroParseLogsFn, onMinedFn: aeroOnMinedFn } =
          SellHandlers.buildAeroSellHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash,
            undefined, // isGroup
            onTransactionSuccess
          );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn: aeroParseLogsFn,
          onMinedFn: aeroOnMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "UniswapV3") {
        const tier = bestDex?.feeTier || 3000;
        const swapRes = await sellTokenV3({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          feePercent,
          feeTier: tier,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn: uniV3ParseLogsFn, onMinedFn: uniV3OnMinedFn } =
          SellHandlers.buildUniV3SellHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash,
            undefined, // isGroup
            onTransactionSuccess
          );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn: uniV3ParseLogsFn,
          onMinedFn: uniV3OnMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "ZoraMultiHop") {
        const swapRes = await sellTokenZoraMultiHop({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          slippagePercent: slippage,
          feePercent,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn: zoraParseLogsFn, onMinedFn: zoraOnMinedFn } =
          SellHandlers.buildZoraSellHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash,
            undefined, // isGroup
            onTransactionSuccess
          );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn: zoraParseLogsFn,
          onMinedFn: zoraOnMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "ApeStore") {
        const swapRes = await sellTokenVIVIApeStore({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          slippagePercent: slippage,
          feePercent,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const {
          parseLogsFn: apeStoreParseLogsFn,
          onMinedFn: apeStoreOnMinedFn,
        } = SellHandlers.buildApeStoreSellHandlers(
          ctx,
          token!,
          userId,
          walletId,
          txHash,
          undefined, // isGroup
          onTransactionSuccess
        );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn: apeStoreParseLogsFn,
          onMinedFn: apeStoreOnMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "VirtualToken") {
        const swapRes = await sellTokenVirtualToken({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          slippagePercent: slippage,
          feePercent,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn: virtualParseLogsFn, onMinedFn: virtualOnMinedFn } =
          SellHandlers.buildVirtualTokenSellHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash,
            undefined, // isGroup
            onTransactionSuccess
          );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn: virtualParseLogsFn,
          onMinedFn: virtualOnMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else if (bestDex?.dexName === "UniswapV4") {
        const swapRes = await sellTokenV4({
          ctx,
          userId,
          walletId,
          tokenAddress: tokenAddress as Address,
          tokenAmount,
          slippagePercent: slippage,
          feePercent,
          bestDex,
        });
        txHash = swapRes.txHash;
        waitReceipt = swapRes.waitReceipt;

        const { parseLogsFn: v4ParseLogsFn, onMinedFn: v4OnMinedFn } =
          SellHandlers.buildUniswapV4SellHandlers(
            ctx,
            token!,
            userId,
            walletId,
            txHash,
            undefined, // isGroup
            onTransactionSuccess
          );

        await handleTxNotificationsWithLinks({
          ctx,
          txHash,
          waitReceipt,
          parseLogsFn: v4ParseLogsFn,
          onMinedFn: v4OnMinedFn,
          swapType: "Sell",
          symbol: token!.symbol,
          tokenAddress: token!.address,
        });
      } else {
        throw new Error(TRADE_TEXTS.ERRORS.NO_POOL);
      }
    } catch (error) {
      this.log("error", ctx, `Error selling token: ${error}`);
      console.log(error);
      throw error;
    }
  }
}
