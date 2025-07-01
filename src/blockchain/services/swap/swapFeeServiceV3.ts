// src/services/swap/swapFeeServiceV3.ts
import { Address, decodeEventLog, getAddress, TransactionReceipt } from "viem";
import { SpeedEnum, Wallet } from "@prisma/client";

import { logger } from "@logger";
import { contracts } from "@config";

import { VIVIUniswapV3ABI } from "@abis";

import {
  publicClientQuickNode,
  getUserWalletClientQuickNode,
  publicClientDRPC,
  publicClientBaseOficial,
} from "@client";

import {
  getGasOverridesForSpeed,
  estimateBuyGas,
  estimateSellGas,
  DexQuoteResultBuy,
  DexQuoteResultSell,
  ensureAllowanceLogic,
  writeContractWithRetries,
  SwapResult,
} from "@blockchain";

import { decryptPrivateKey } from "@services";

import { GlobalSceneContext } from "@types";

const FEE_SWAP_WRAPPERV3 = getAddress(contracts.FEE_SWAP_WRAPPERV3 || "");
const WETH_ADDRESS = getAddress(contracts.ETH || "");

interface BuyV3Args {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  amountEth: bigint;
  feePercent: number;
  feeTier: number;
  bestDex?: DexQuoteResultBuy;
}

export async function buyTokenV3({
  ctx,
  userId,
  walletId,
  tokenAddress,
  amountEth,
  feePercent,
  feeTier,
  bestDex,
}: BuyV3Args): Promise<SwapResult> {
  // ─────────────────────────────────────────────────────────────
  // SELECT WALLET
  // ─────────────────────────────────────────────────────────────
  let walletEntity: Wallet | null;
  if (walletId) {
    walletEntity = await ctx.services.walletService.getWalletById(walletId);
    if (!walletEntity) throw new Error("walletId not found");
  } else {
    walletEntity = await ctx.services.walletService.getSelectedWallet(userId);
  }
  if (walletEntity === null) throw new Error("wallet not found");

  const privateKey = decryptPrivateKey(walletEntity.encryptedPrivKey);
  const walletClient = getUserWalletClientQuickNode(privateKey);

  const user = await ctx.services.userService.getUserById(userId);
  const userSpeed = user?.speed || SpeedEnum.AUTO;

  // Estimar gas si tenemos bestDex y es UniswapV3
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "UniswapV3") {
    try {
      estimatedGas = await estimateBuyGas({
        publicClient: publicClientQuickNode,
        bestDex,
        walletAddress: getAddress(walletEntity.address),
        tokenAddress,
        amountEth,
        feePercent,
      });
      logger.info(`[buyTokenV3] Gas estimado para UniswapV3: ${estimatedGas}`);
    } catch (err) {
      logger.error("[buyTokenV3] Error estimando gas:", err);
    }
  }

  // Optimizado: Pasamos el valor ETH y tipo de operación al servicio de gas
  const gasOverrides = await getGasOverridesForSpeed(
    userSpeed,
    publicClientQuickNode,
    {
      ethValue: amountEth,
      operationType: "BUY",
      estimatedGas,
    }
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  const amountOutMin = 0n; // podrías calcular con quoter + slippage

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPERV3,
      abi: VIVIUniswapV3ABI,
      functionName: "VIVIBuy",
      args: [
        {
          tokenIn: WETH_ADDRESS,
          tokenOut: getAddress(tokenAddress),
          feeTier,
          amountIn: 0n,
          recipient: getAddress(walletEntity.address),
          deadline,
          amountOutMin,
        },
        BigInt(feePercent),
      ],
      value: amountEth,
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas, // Usamos el gas limit dinámico
    },
    maxRetries: 3,
  });

  const waitReceipt = (async (): Promise<TransactionReceipt> => {
    const startTime = Date.now();
    const MAX_WAIT_TIME = 180000; // 3 minutes in milliseconds

    // Keep trying until we get a receipt or timeout
    while (Date.now() - startTime < MAX_WAIT_TIME) {
      logger.info(
        `Checking receipt for ${txHash} (elapsed: ${Math.floor(
          (Date.now() - startTime) / 1000
        )}s)`
      );

      // Try all RPC providers in sequence
      // 1. Try QuickNode direct check
      try {
        const receipt = await publicClientQuickNode.getTransactionReceipt({
          hash: txHash,
        });
        if (receipt) {
          logger.info(`QuickNode direct check success for ${txHash}`);

          if (receipt.status === "reverted") {
            logger.warn(`[buyTokenV3] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIUniswapV3ABI,
                eventName: "Buy",
                data: log.data as `0x${string}`,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              });
              tokensBought = event.args.tokensOut as bigint;
            } catch {}
          }

          setImmediate(() =>
            ensureAllowanceLogic(ctx, {
              walletEntity,
              tokenAddress,
              requiredAmount: tokensBought,
              spender: FEE_SWAP_WRAPPERV3,
              privateKey,
            }).catch((err) =>
              logger.error("Background ensureAllowance (V3) failed:", err)
            )
          );

          return receipt;
        }
      } catch (error1: any) {
        logger.debug(`QuickNode direct check failed: ${error1.message}`);
      }

      // 2. Try DRPC if available
      try {
        const receipt = await publicClientDRPC.getTransactionReceipt({
          hash: txHash,
        });
        if (receipt) {
          logger.info(`DRPC direct check success for ${txHash}`);

          if (receipt.status === "reverted") {
            logger.warn(`[buyTokenV3] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIUniswapV3ABI,
                eventName: "Buy",
                data: log.data as `0x${string}`,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              });
              tokensBought = event.args.tokensOut as bigint;
            } catch {}
          }

          setImmediate(() =>
            ensureAllowanceLogic(ctx, {
              walletEntity,
              tokenAddress,
              requiredAmount: tokensBought,
              spender: FEE_SWAP_WRAPPERV3,
              privateKey,
            }).catch((err) =>
              logger.error("Background ensureAllowance (V3) failed:", err)
            )
          );

          return receipt;
        }
      } catch (error2: any) {
        logger.debug(`DRPC check failed: ${error2.message}`);
      }

      // 3. Try Base Official RPC
      try {
        const receipt = await publicClientBaseOficial.getTransactionReceipt({
          hash: txHash,
        });
        if (receipt) {
          logger.info(`Base Official direct check success for ${txHash}`);

          if (receipt.status === "reverted") {
            logger.warn(`[buyTokenV3] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIUniswapV3ABI,
                eventName: "Buy",
                data: log.data as `0x${string}`,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              });
              tokensBought = event.args.tokensOut as bigint;
            } catch {}
          }

          setImmediate(() =>
            ensureAllowanceLogic(ctx, {
              walletEntity,
              tokenAddress,
              requiredAmount: tokensBought,
              spender: FEE_SWAP_WRAPPERV3,
              privateKey,
            }).catch((err) =>
              logger.error("Background ensureAllowance (V3) failed:", err)
            )
          );

          return receipt;
        }
      } catch (error3: any) {
        logger.debug(`Base Official check failed: ${error3.message}`);
      }

      // If we get here, none of the approaches worked this iteration
      // Wait a bit before next attempt
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Log progress periodically
      if ((Date.now() - startTime) % 5000 < 1000) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.floor(
          (MAX_WAIT_TIME - (Date.now() - startTime)) / 1000
        );
        logger.info(
          `Still searching for receipt: ${elapsed}s elapsed, ${remaining}s remaining`
        );
      }
    }

    // If we exit the loop, we've timed out
    throw new Error(
      `Timed out after 3 minutes waiting for receipt for ${txHash}`
    );
  })();

  return { txHash, waitReceipt };
}

export async function sellTokenV3({
  ctx,
  userId,
  walletId,
  tokenAddress,
  tokenAmount,
  feePercent,
  feeTier,
  bestDex,
  estimatedEthValue,
}: {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  tokenAmount: bigint;
  feePercent: number;
  feeTier: number;
  bestDex?: DexQuoteResultSell;
  estimatedEthValue?: bigint;
}): Promise<SwapResult> {
  let walletEntity: Wallet | null;
  if (walletId) {
    walletEntity = await ctx.services.walletService.getWalletById(walletId);
    if (!walletEntity) throw new Error("walletId not found");
  } else {
    walletEntity = await ctx.services.walletService.getSelectedWallet(userId);
  }
  if (walletEntity === null) throw new Error("wallet not found");

  const privateKey = decryptPrivateKey(walletEntity.encryptedPrivKey);
  const walletClient = getUserWalletClientQuickNode(privateKey);

  const user = await ctx.services.userService.getUserById(userId);
  const userSpeed = user?.speed || SpeedEnum.AUTO;

  // Si tenemos bestDex, usamos su valor de salida como estimated ETH value
  if (bestDex && !estimatedEthValue) {
    estimatedEthValue = BigInt(bestDex.amountOut || "0");
  }

  // Estimar gas si tenemos bestDex y es UniswapV3
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "UniswapV3") {
    try {
      estimatedGas = await estimateSellGas({
        publicClient: publicClientQuickNode,
        bestDex,
        walletAddress: getAddress(walletEntity.address),
        tokenAddress,
        tokenAmount,
        feePercent,
      });
      logger.info(`[sellTokenV3] Gas estimado para UniswapV3: ${estimatedGas}`);
    } catch (err) {
      logger.error("[sellTokenV3] Error estimando gas:", err);
    }
  }

  const gasOverrides = await getGasOverridesForSpeed(
    userSpeed,
    publicClientQuickNode,
    {
      ethValue: estimatedEthValue || 0n,
      operationType: "SELL",
      estimatedGas,
    }
  );

  await ensureAllowanceLogic(ctx, {
    walletEntity,
    tokenAddress,
    requiredAmount: tokenAmount,
    spender: FEE_SWAP_WRAPPERV3,
    privateKey,
  });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  const amountOutMin = 1n;

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPERV3,
      abi: VIVIUniswapV3ABI,
      functionName: "VIVISell",
      args: [
        {
          tokenIn: getAddress(tokenAddress),
          tokenOut: WETH_ADDRESS,
          feeTier,
          amountIn: tokenAmount,
          recipient: getAddress(walletEntity.address),
          deadline,
          amountOutMin,
        },
        BigInt(feePercent),
      ],
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas, // Gas limit dinámico
    },
    maxRetries: 3,
  });

  const waitReceipt = (async (): Promise<TransactionReceipt> => {
    const startTime = Date.now();
    const MAX_WAIT_TIME = 180000; // 3 minutes in milliseconds

    // Keep trying until we get a receipt or timeout
    while (Date.now() - startTime < MAX_WAIT_TIME) {
      logger.info(
        `Checking receipt for ${txHash} (elapsed: ${Math.floor(
          (Date.now() - startTime) / 1000
        )}s)`
      );

      // Try all RPC providers in sequence
      // 1. Try QuickNode direct check
      try {
        const receipt = await publicClientQuickNode.getTransactionReceipt({
          hash: txHash,
        });
        if (receipt) {
          logger.info(`QuickNode direct check success for ${txHash}`);

          if (receipt.status === "reverted") {
            logger.warn(`[sellTokenV3] TX failed => ${txHash}`);
          }
          return receipt;
        }
      } catch (error1: any) {
        logger.debug(`QuickNode direct check failed: ${error1.message}`);
      }

      // 2. Try DRPC if available
      try {
        const receipt = await publicClientDRPC.getTransactionReceipt({
          hash: txHash,
        });
        if (receipt) {
          logger.info(`DRPC direct check success for ${txHash}`);

          if (receipt.status === "reverted") {
            logger.warn(`[sellTokenV3] TX failed => ${txHash}`);
          }
          return receipt;
        }
      } catch (error2: any) {
        logger.debug(`DRPC check failed: ${error2.message}`);
      }

      // 3. Try Base Official RPC
      try {
        const receipt = await publicClientBaseOficial.getTransactionReceipt({
          hash: txHash,
        });
        if (receipt) {
          logger.info(`Base Official direct check success for ${txHash}`);

          if (receipt.status === "reverted") {
            logger.warn(`[sellTokenV3] TX failed => ${txHash}`);
          }
          return receipt;
        }
      } catch (error3: any) {
        logger.debug(`Base Official check failed: ${error3.message}`);
      }

      // If we get here, none of the approaches worked this iteration
      // Wait a bit before next attempt
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Log progress periodically
      if ((Date.now() - startTime) % 5000 < 1000) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.floor(
          (MAX_WAIT_TIME - (Date.now() - startTime)) / 1000
        );
        logger.info(
          `Still searching for receipt: ${elapsed}s elapsed, ${remaining}s remaining`
        );
      }
    }

    // If we exit the loop, we've timed out
    throw new Error(
      `Timed out after 3 minutes waiting for receipt for ${txHash}`
    );
  })();

  return { txHash, waitReceipt };
}
