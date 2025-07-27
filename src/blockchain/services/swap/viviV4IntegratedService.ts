// src/blockchain/services/swap/viviV4IntegratedService.ts

import {
  Address,
  Hex,
  createPublicClient,
  parseUnits,
  formatUnits,
  createWalletClient,
  http,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { Wallet } from "@prisma/client";
import {
  getV4QuoteBuy,
  getV4QuoteSell,
  findV4Pools,
  V4QuoteResult,
} from "./uniswapV4Service";
import {
  executeV4Buy,
  executeV4Sell,
  executePermit2Approve,
  FeeReceiver,
  TradeResult,
  V4BuyParams,
  V4SellParams,
} from "./viviUniswapV4TradeService";
import { ensurePermit2AllowanceLogic } from "../permit2/ensurePermit2Allowance";
import { ensureAllowanceLogic } from "../token/ensureAllowance";
import { publicClientDRPC } from "@client";
import { VIVIUniswapV4ABI } from "@abis";

export interface V4IntegratedBuyParams {
  ctx: GlobalSceneContext;
  walletEntity: Wallet;
  privateKey: Hex;
  contractAddress: Address;
  tokenAddress: Address;
  ethAmount: bigint;
  feeBps: bigint;
  slippagePercent: number;
  additionalFeeReceivers?: FeeReceiver[];
}

export interface V4IntegratedSellParams {
  ctx: GlobalSceneContext;
  walletEntity: Wallet;
  privateKey: Hex;
  contractAddress: Address;
  tokenAddress: Address;
  tokenAmount: bigint;
  feeBps: bigint;
  slippagePercent: number;
  decimalsIn: number;
  additionalFeeReceivers?: FeeReceiver[];
}

export interface IntegratedTradeResult extends TradeResult {
  quote?: V4QuoteResult;
  actualAmountOut?: string;
  formattedAmountOut?: string;
  priceImpact?: string;
}

/**
 * Ejecuta una compra completa en V4: Quote → Trade
 * No necesita approve porque es ETH → Token
 */
export async function executeV4IntegratedBuy(
  params: V4IntegratedBuyParams
): Promise<IntegratedTradeResult> {
  const {
    ctx,
    walletEntity,
    privateKey,
    contractAddress,
    tokenAddress,
    ethAmount,
    feeBps,
    slippagePercent,
    additionalFeeReceivers = [],
  } = params;

  try {
    logger.info(
      `🚀 Starting V4 Integrated BUY for ${formatUnits(ethAmount, 18)} ETH`
    );

    // 1. Obtener quote
    const quote = await getV4QuoteBuy(
      publicClientDRPC,
      tokenAddress,
      ethAmount,
      18 // Asumimos 18 decimales, ajustar según token
    );

    if (!quote) {
      return {
        hash: "0x0" as `0x${string}`,
        success: false,
        error: "No V4 liquidity available for this token",
      };
    }

    // 2. Calcular minAmountOut con slippage
    const expectedOut = BigInt(quote.amountOut);
    const slippageAmount =
      (expectedOut * BigInt(slippagePercent * 100)) / 10000n;
    const minAmountOut = expectedOut - slippageAmount;

    logger.info(`📊 Quote: ${quote.formattedOut} tokens expected`);
    logger.info(
      `🎯 Min Amount Out (${slippagePercent}% slippage): ${formatUnits(
        minAmountOut,
        18
      )}`
    );

    // 3. Aprobar WETH para Permit2 (necesario para el wrap ETH → WETH)
    logger.info(`🔑 Approving WETH for Permit2...`);
    try {
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(process.env.RPC_URL),
      }).extend(publicActions);

      // Calcular expiration (1 hora desde ahora)
      const expiration = Math.floor(Date.now() / 1000) + 3600;

      const approveHash = await walletClient.writeContract({
        address: contractAddress,
        abi: VIVIUniswapV4ABI,
        functionName: "approveWETHPermit2",
        args: [ethAmount, expiration],
        gas: 200_000n,
      });

      await walletClient.waitForTransactionReceipt({ hash: approveHash });
      logger.info(`✅ WETH approved for Permit2: ${approveHash}`);
    } catch (approveError) {
      logger.error(`❌ WETH Permit2 approval failed: ${approveError}`);
      throw new Error(`WETH approval failed: ${approveError}`);
    }

    // 4. Ejecutar trade (no necesita approve para ETH)
    const tradeParams: V4BuyParams = {
      contractAddress,
      privateKey,
      poolKey: quote.poolKey,
      ethAmount,
      minAmountOut,
      feeBps,
      additionalFeeReceivers,
      gasLimit: 1_000_000n,
    };

    const result = await executeV4Buy(tradeParams);

    return {
      ...result,
      quote,
      actualAmountOut: quote.amountOut,
      formattedAmountOut: quote.formattedOut,
    };
  } catch (error: any) {
    logger.error(`❌ Error in V4 Integrated BUY: ${error.message}`);
    return {
      hash: "0x0" as `0x${string}`,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Ejecuta una venta completa en V4: Quote → Approve → Trade
 */
export async function executeV4IntegratedSell(
  params: V4IntegratedSellParams
): Promise<IntegratedTradeResult> {
  const {
    ctx,
    walletEntity,
    privateKey,
    contractAddress,
    tokenAddress,
    tokenAmount,
    feeBps,
    slippagePercent,
    decimalsIn,
    additionalFeeReceivers = [],
  } = params;

  try {
    logger.info(
      `🚀 Starting V4 Integrated SELL for ${formatUnits(
        tokenAmount,
        decimalsIn
      )} tokens`
    );

    // 1. Obtener quote
    const quote = await getV4QuoteSell(
      publicClientDRPC,
      tokenAddress,
      tokenAmount,
      decimalsIn,
      18 // ETH tiene 18 decimales
    );

    if (!quote) {
      return {
        hash: "0x0" as `0x${string}`,
        success: false,
        error: "No V4 liquidity available for this token",
      };
    }

    // 2. Calcular minAmountOut con slippage
    const expectedOut = BigInt(quote.amountOut);
    const slippageAmount =
      (expectedOut * BigInt(slippagePercent * 100)) / 10000n;
    const minAmountOut = expectedOut - slippageAmount;

    logger.info(`📊 Quote: ${quote.formattedOut} ETH expected`);
    logger.info(
      `🎯 Min Amount Out (${slippagePercent}% slippage): ${formatUnits(
        minAmountOut,
        18
      )} ETH`
    );

    // 3. Asegurar allowances (ERC-20 + Permit2)
    logger.info(`🔐 Ensuring allowances...`);

    // 3a. ERC-20 Allowance estándar
    await ensureAllowanceLogic(ctx, {
      walletEntity,
      tokenAddress,
      requiredAmount: tokenAmount,
      spender: contractAddress,
      privateKey,
    });

    // 3b. Permit2 Allowance
    await ensurePermit2AllowanceLogic(ctx, {
      walletEntity,
      tokenAddress,
      requiredAmount: tokenAmount,
      spender: contractAddress,
      privateKey,
      viviContractAddress: contractAddress,
    });

    logger.info(`✅ Allowances ensured`);

    // 4. Ejecutar trade
    const tradeParams: V4SellParams = {
      contractAddress,
      privateKey,
      poolKey: quote.poolKey,
      tokenAmount,
      minAmountOut,
      feeBps,
      additionalFeeReceivers,
      gasLimit: 1_200_000n,
    };

    const result = await executeV4Sell(tradeParams);

    return {
      ...result,
      quote,
      actualAmountOut: quote.amountOut,
      formattedAmountOut: quote.formattedOut,
    };
  } catch (error: any) {
    logger.error(`❌ Error in V4 Integrated SELL: ${error.message}`);
    return {
      hash: "0x0" as `0x${string}`,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Verifica si V4 está disponible para un token
 */
export async function isV4Available(tokenAddress: Address): Promise<boolean> {
  try {
    const pools = await findV4Pools(publicClientDRPC, tokenAddress);
    return pools.length > 0;
  } catch (error) {
    logger.error(`Error checking V4 availability: ${error}`);
    return false;
  }
}
