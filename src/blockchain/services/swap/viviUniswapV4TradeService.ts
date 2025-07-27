// src/blockchain/services/swap/viviUniswapV4TradeService.ts

import {
  Address,
  Hex,
  createWalletClient,
  http,
  publicActions,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { VIVIUniswapV4ABI } from "@abis";
import { logger } from "@logger";
import { PoolKey } from "./uniswapV4Service";

export interface FeeReceiver {
  receiver: Address;
  bps: bigint;
}

export interface V4TradeParams {
  contractAddress: Address;
  privateKey: Hex;
  poolKey: PoolKey;
  minAmountOut: bigint;
  feeBps: bigint;
  additionalFeeReceivers?: FeeReceiver[];
  gasLimit?: bigint;
}

export interface V4BuyParams extends V4TradeParams {
  ethAmount: bigint;
}

export interface V4SellParams extends V4TradeParams {
  tokenAmount: bigint;
}

export interface TradeResult {
  hash: `0x${string}`;
  success: boolean;
  blockNumber?: bigint;
  gasUsed?: bigint;
  error?: string;
}

/**
 * Ejecuta una compra en VIVIUniswapV4 (ETH → Token)
 */
export async function executeV4Buy(params: V4BuyParams): Promise<TradeResult> {
  const {
    contractAddress,
    privateKey,
    poolKey,
    ethAmount,
    minAmountOut,
    feeBps,
    additionalFeeReceivers = [],
    gasLimit = 800_000n,
  } = params;

  try {
    // Crear account y wallet client
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    logger.info(`🔄 Executing V4 BUY: ${ethAmount} ETH → tokens`);
    logger.info(`📋 Pool: ${poolKey.currency0}/${poolKey.currency1}`);
    logger.info(`💰 Min Amount Out: ${minAmountOut}`);
    logger.info(`💸 Fee BPS: ${feeBps}`);

    // Preparar parámetros del contrato
    const contractParams = {
      key: {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      minAmountOut,
      feeBps,
      additionalFeeReceivers: additionalFeeReceivers.map((receiver) => ({
        receiver: receiver.receiver,
        bps: receiver.bps,
      })),
    };

    // Ejecutar la transacción
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: VIVIUniswapV4ABI,
      functionName: "VIVIBuy",
      args: [
        contractParams.key,
        contractParams.minAmountOut,
        contractParams.feeBps,
        contractParams.additionalFeeReceivers,
      ],
      value: ethAmount,
      gas: gasLimit,
    });

    logger.info(`📤 Transaction sent: ${hash}`);

    // Esperar confirmación
    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      logger.info(
        `✅ V4 BUY successful! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`
      );
      return {
        hash,
        success: true,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } else {
      logger.error(`❌ V4 BUY failed! Transaction reverted`);
      return {
        hash,
        success: false,
        error: "Transaction reverted",
      };
    }
  } catch (error: any) {
    logger.error(`❌ Error executing V4 BUY: ${error.message}`);
    return {
      hash: "0x0" as `0x${string}`,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Ejecuta una venta en VIVIUniswapV4 (Token → ETH)
 */
export async function executeV4Sell(
  params: V4SellParams
): Promise<TradeResult> {
  const {
    contractAddress,
    privateKey,
    poolKey,
    tokenAmount,
    minAmountOut,
    feeBps,
    additionalFeeReceivers = [],
    gasLimit = 900_000n,
  } = params;

  try {
    // Crear account y wallet client
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    logger.info(`🔄 Executing V4 SELL: ${tokenAmount} tokens → ETH`);
    logger.info(`📋 Pool: ${poolKey.currency0}/${poolKey.currency1}`);
    logger.info(`💰 Min Amount Out: ${minAmountOut} ETH`);
    logger.info(`💸 Fee BPS: ${feeBps}`);

    // Preparar parámetros del contrato
    const contractParams = {
      key: {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      amountIn: tokenAmount,
      minAmountOut,
      feeBps,
      additionalFeeReceivers: additionalFeeReceivers.map((receiver) => ({
        receiver: receiver.receiver,
        bps: receiver.bps,
      })),
    };

    // Ejecutar la transacción
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: VIVIUniswapV4ABI,
      functionName: "VIVISell",
      args: [
        contractParams.key,
        contractParams.amountIn,
        contractParams.minAmountOut,
        contractParams.feeBps,
        contractParams.additionalFeeReceivers,
      ],
      gas: gasLimit,
    });

    logger.info(`📤 Transaction sent: ${hash}`);

    // Esperar confirmación
    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      logger.info(
        `✅ V4 SELL successful! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`
      );
      return {
        hash,
        success: true,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } else {
      logger.error(`❌ V4 SELL failed! Transaction reverted`);
      return {
        hash,
        success: false,
        error: "Transaction reverted",
      };
    }
  } catch (error: any) {
    logger.error(`❌ Error executing V4 SELL: ${error.message}`);
    return {
      hash: "0x0" as `0x${string}`,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Ejecuta approve para Permit2 en el contrato VIVIUniswapV4
 */
export async function executePermit2Approve(
  contractAddress: Address,
  tokenAddress: Address,
  privateKey: Hex,
  amount?: bigint,
  expiration?: number
): Promise<TradeResult> {
  try {
    // Crear account y wallet client
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    // Valores por defecto para máxima aprobación
    const defaultAmount = 2n ** 160n - 1n; // Max uint160
    const defaultExpiration =
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 año

    const approveAmount = amount || defaultAmount;
    const approveExpiration = expiration || defaultExpiration;

    logger.info(`🔄 Executing Permit2 Approve for token: ${tokenAddress}`);
    logger.info(`💰 Amount: ${approveAmount}`);
    logger.info(`⏰ Expiration: ${approveExpiration}`);

    // Ejecutar la transacción
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: VIVIUniswapV4ABI,
      functionName: "approveTokenPermit2",
      args: [tokenAddress, approveAmount, approveExpiration],
      gas: 200_000n,
    });

    logger.info(`📤 Permit2 Approve transaction sent: ${hash}`);

    // Esperar confirmación
    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      logger.info(
        `✅ Permit2 Approve successful! Block: ${receipt.blockNumber}`
      );
      return {
        hash,
        success: true,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } else {
      logger.error(`❌ Permit2 Approve failed! Transaction reverted`);
      return {
        hash,
        success: false,
        error: "Transaction reverted",
      };
    }
  } catch (error: any) {
    logger.error(`❌ Error executing Permit2 Approve: ${error.message}`);
    return {
      hash: "0x0" as `0x${string}`,
      success: false,
      error: error.message,
    };
  }
}
