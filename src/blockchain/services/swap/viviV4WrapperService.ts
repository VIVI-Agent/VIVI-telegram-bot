// src/blockchain/services/swap/viviV4WrapperService.ts

import { Address, Hex, parseUnits } from "viem";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import {
  executeV4IntegratedBuy,
  executeV4IntegratedSell,
  V4IntegratedBuyParams,
  V4IntegratedSellParams,
} from "./viviV4IntegratedService";
import { DexQuoteResultBuy } from "../priceComparison/priceComparisonService";
import { DexQuoteResultSell } from "../priceComparison/priceComparisonServiceSell";
import { decryptPrivateKey } from "@services";
import { contracts } from "@config";
import {
  estimateBuyGas,
  estimateSellGas,
} from "../gasEstimation/gasEstimation";
import { publicClientDRPC } from "@client";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, publicActions } from "viem";
import { base } from "viem/chains";
import { SwapResult } from "./types"; // Import SwapResult from types

// Usar la dirección del contrato V4 desde la configuración
const VIVI_V4_CONTRACT_ADDRESS =
  contracts.FEE_SWAP_WRAPPER_V4_ZORA_HOOK as Address;

// Interfaces locales
export interface BuyTokenV4Params {
  ctx: GlobalSceneContext;
  userId: number;
  walletId: number;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex: DexQuoteResultBuy;
}

export interface SellTokenV4Params {
  ctx: GlobalSceneContext;
  userId: number;
  walletId: number;
  tokenAddress: Address;
  tokenAmount: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex: DexQuoteResultSell;
}

/**
 * Wrapper para compra V4 - mantiene la misma interfaz que otros DEXes
 */
export async function buyTokenV4(
  params: BuyTokenV4Params
): Promise<SwapResult> {
  const {
    ctx,
    userId,
    walletId,
    tokenAddress,
    amountEth,
    slippagePercent,
    feePercent,
    bestDex,
  } = params;

  try {
    logger.info(`🔄 V4 Buy: ${amountEth} ETH → ${tokenAddress}`);

    // Obtener datos de wallet y usuario
    const walletEntity = await ctx.services.walletService.getWalletById(
      walletId
    );
    if (!walletEntity) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    const privateKey = decryptPrivateKey(walletEntity.encryptedPrivKey) as Hex;

    // feePercent ya viene en basis points (ej: 25 para 0.25%), no necesitamos convertir
    const feeBps = BigInt(Math.round(feePercent)); // 25 → 25 bps

    // Estimar gas antes de ejecutar la transacción
    try {
      const estimatedGas = await estimateBuyGas({
        publicClient: publicClientDRPC,
        bestDex,
        walletAddress: walletEntity.address as Address,
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        additionalFeeReceivers: [],
      });
      logger.info(`🔥 V4 Buy estimated gas: ${estimatedGas}`);
    } catch (gasEstimationError) {
      logger.warn(`⚠️ V4 Buy gas estimation failed: ${gasEstimationError}`);
      // Continuar con gas por defecto si falla la estimación
    }

    // Preparar parámetros para V4
    const v4Params: V4IntegratedBuyParams = {
      ctx,
      walletEntity,
      privateKey,
      contractAddress: VIVI_V4_CONTRACT_ADDRESS,
      tokenAddress,
      ethAmount: amountEth,
      feeBps,
      slippagePercent,
      additionalFeeReceivers: [], // Por defecto vacío, se puede personalizar
    };

    // Ejecutar compra V4
    const result = await executeV4IntegratedBuy(v4Params);

    if (!result.success) {
      throw new Error(result.error || "V4 buy failed");
    }

    logger.info(`✅ V4 Buy successful: ${result.hash}`);

    // Obtener el transaction receipt real con los logs
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    // Devolver en el formato esperado por los handlers
    return {
      txHash: result.hash,
      waitReceipt: walletClient.waitForTransactionReceipt({
        hash: result.hash,
      }),
    };
  } catch (error) {
    logger.error(`❌ V4 Buy error: ${error}`);
    throw error;
  }
}

/**
 * Wrapper para venta V4 - mantiene la misma interfaz que otros DEXes
 */
export async function sellTokenV4(
  params: SellTokenV4Params
): Promise<SwapResult> {
  const {
    ctx,
    userId,
    walletId,
    tokenAddress,
    tokenAmount,
    slippagePercent,
    feePercent,
    bestDex,
  } = params;

  try {
    logger.info(`🔄 V4 Sell: ${tokenAmount} ${tokenAddress} → ETH`);

    // Obtener datos de wallet y usuario
    const walletEntity = await ctx.services.walletService.getWalletById(
      walletId
    );
    if (!walletEntity) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    // Obtener datos del token para decimales
    const tokenData = await ctx.services.tokenService.getTokenByAddress(
      tokenAddress
    );
    if (!tokenData) {
      throw new Error(`Token ${tokenAddress} not found`);
    }

    const privateKey = decryptPrivateKey(walletEntity.encryptedPrivKey) as Hex;

    // feePercent ya viene en basis points (ej: 25 para 0.25%), no necesitamos convertir
    const feeBps = BigInt(Math.round(feePercent)); // 25 → 25 bps

    // Estimar gas antes de ejecutar la transacción
    try {
      const estimatedGas = await estimateSellGas({
        publicClient: publicClientDRPC,
        bestDex,
        walletAddress: walletEntity.address as Address,
        tokenAddress,
        tokenAmount,
        slippagePercent,
        feePercent,
        additionalFeeReceivers: [],
      });
      logger.info(`🔥 V4 Sell estimated gas: ${estimatedGas}`);
    } catch (gasEstimationError) {
      logger.warn(`⚠️ V4 Sell gas estimation failed: ${gasEstimationError}`);
      // Continuar con gas por defecto si falla la estimación
    }

    // Preparar parámetros para V4
    const v4Params: V4IntegratedSellParams = {
      ctx,
      walletEntity,
      privateKey,
      contractAddress: VIVI_V4_CONTRACT_ADDRESS,
      tokenAddress,
      tokenAmount,
      feeBps,
      slippagePercent,
      decimalsIn: tokenData.decimals,
      additionalFeeReceivers: [], // Por defecto vacío
    };

    // Ejecutar venta V4
    const result = await executeV4IntegratedSell(v4Params);

    if (!result.success) {
      throw new Error(result.error || "V4 sell failed");
    }

    logger.info(`✅ V4 Sell successful: ${result.hash}`);

    // Obtener el transaction receipt real con los logs
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    // Devolver en el formato esperado por los handlers
    return {
      txHash: result.hash,
      waitReceipt: walletClient.waitForTransactionReceipt({
        hash: result.hash,
      }),
    };
  } catch (error) {
    logger.error(`❌ V4 Sell error: ${error}`);
    throw error;
  }
}
