// src/services/swap/swapFeeService.ts
import { Address, decodeEventLog, getAddress, TransactionReceipt } from "viem";
import { SpeedEnum, Wallet } from "@prisma/client";

import { logger } from "@logger";
import { contracts } from "@config";

import { VIVIUniswapV2ABI } from "@abis";

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
import { AddressValidator } from "@utils";

const FEE_SWAP_WRAPPER_ADDRESS = getAddress(contracts.FEE_SWAP_WRAPPER || "");
const WETH_ADDRESS = getAddress(contracts.ETH || "");

interface BuyUniV2Args {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex: DexQuoteResultBuy;
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
}

export async function buyToken({
  ctx,
  userId,
  walletId,
  tokenAddress,
  amountEth,
  slippagePercent,
  feePercent,
  bestDex,
  overrideAdditionalFeeReceivers,
}: BuyUniV2Args): Promise<SwapResult> {
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

  // ─────────────────────────────────────────────────────────────
  // CHECK REFERRAL AND GET REWARD WALLET
  // ─────────────────────────────────────────────────────────────
  let additionalFeeReceivers: Array<{ receiver: Address; bps: bigint }> = [];
  if (overrideAdditionalFeeReceivers) {
    additionalFeeReceivers = overrideAdditionalFeeReceivers;
  } else if (user?.referredById) {
    const referrer = await ctx.services.userService.getUserById(
      user.referredById
    );
    if (referrer?.rewardWallet) {
      const rewardWallet = AddressValidator.parseEthereumAddress(
        referrer.rewardWallet
      );
      if (rewardWallet) {
        additionalFeeReceivers = [
          {
            receiver: rewardWallet,
            bps: 2000n,
          },
        ];
      }
      logger.info(
        `[buyToken:UniswapV2] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[buyToken:UniswapV2] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[buyToken:UniswapV2] User ${userId} has no referrer`);
  }

  // Usar bestDex para estimar gas si está disponible
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "UniswapV2") {
    try {
      estimatedGas = await estimateBuyGas({
        publicClient: publicClientQuickNode,
        bestDex,
        walletAddress: getAddress(walletEntity.address),
        tokenAddress,
        amountEth,
        slippagePercent,
        feePercent,
        additionalFeeReceivers,
      });
      logger.info(`[buyToken] Gas estimado para UniswapV2: ${estimatedGas}`);
    } catch (err) {
      logger.error("[buyToken] Error estimando gas:", err);
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

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPER_ADDRESS,
      abi: VIVIUniswapV2ABI,
      functionName: "VIVIBuy",
      args: [
        {
          path: [WETH_ADDRESS, getAddress(tokenAddress)],
          amountIn: 0n,
          recipient: getAddress(walletEntity.address),
          deadline,
        },
        BigInt(feePercent),
        BigInt(slippagePercent),
        additionalFeeReceivers,
      ],
      value: amountEth,
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas, // Usamos el gas limit calculado por el servicio
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
            logger.warn(`[buyToken] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIUniswapV2ABI,
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
              spender: FEE_SWAP_WRAPPER_ADDRESS,
              privateKey,
            }).catch((err) =>
              logger.error("Background ensureAllowance failed:", err)
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
            logger.warn(`[buyToken] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIUniswapV2ABI,
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
              spender: FEE_SWAP_WRAPPER_ADDRESS,
              privateKey,
            }).catch((err) =>
              logger.error("Background ensureAllowance failed:", err)
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
            logger.warn(`[buyToken] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIUniswapV2ABI,
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
              spender: FEE_SWAP_WRAPPER_ADDRESS,
              privateKey,
            }).catch((err) =>
              logger.error("Background ensureAllowance failed:", err)
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

export async function sellToken({
  ctx,
  userId,
  walletId,
  tokenAddress,
  tokenAmount,
  slippagePercent,
  feePercent,
  bestDex,
  estimatedEthValue, // Opcional - se puede obtener de bestDex
  overrideAdditionalFeeReceivers,
}: {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  tokenAmount: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex?: DexQuoteResultSell;
  estimatedEthValue?: bigint;
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
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

  // ─────────────────────────────────────────────────────────────
  // CHECK REFERRAL AND GET REWARD WALLET
  // ─────────────────────────────────────────────────────────────
  let additionalFeeReceivers: Array<{ receiver: Address; bps: bigint }> = [];
  if (overrideAdditionalFeeReceivers) {
    additionalFeeReceivers = overrideAdditionalFeeReceivers;
  } else if (user?.referredById) {
    const referrer = await ctx.services.userService.getUserById(
      user.referredById
    );
    if (referrer?.rewardWallet) {
      const rewardWallet = AddressValidator.parseEthereumAddress(
        referrer.rewardWallet
      );
      if (rewardWallet) {
        additionalFeeReceivers = [
          {
            receiver: rewardWallet,
            bps: 2000n,
          },
        ];
      }
      logger.info(
        `[sellToken:UniswapV2] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[sellToken:UniswapV2] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[sellToken:UniswapV2] User ${userId} has no referrer`);
  }

  // Si tenemos bestDex, usamos su valor de salida como estimated ETH value
  if (bestDex && !estimatedEthValue) {
    estimatedEthValue = BigInt(bestDex.amountOut || "0");
  }

  // Estimar gas si tenemos bestDex y es UniswapV2
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "UniswapV2") {
    try {
      estimatedGas = await estimateSellGas({
        publicClient: publicClientQuickNode,
        bestDex,
        walletAddress: getAddress(walletEntity.address),
        tokenAddress,
        tokenAmount,
        slippagePercent,
        feePercent,
        additionalFeeReceivers,
      });
      logger.info(`[sellToken] Gas estimado para UniswapV2: ${estimatedGas}`);
    } catch (err) {
      logger.error("[sellToken] Error estimando gas:", err);
    }
  }

  const gasOverrides = await getGasOverridesForSpeed(
    userSpeed,
    publicClientQuickNode,
    {
      ethValue: estimatedEthValue, // Si no tenemos estimación, usará 0
      operationType: "SELL",
      estimatedGas,
    }
  );

  await ensureAllowanceLogic(ctx, {
    walletEntity,
    tokenAddress,
    requiredAmount: tokenAmount,
    spender: FEE_SWAP_WRAPPER_ADDRESS,
    privateKey,
  });

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPER_ADDRESS,
      abi: VIVIUniswapV2ABI,
      functionName: "VIVISell",
      args: [
        {
          path: [getAddress(tokenAddress), WETH_ADDRESS],
          amountIn: tokenAmount,
          recipient: getAddress(walletEntity.address),
          deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
        },
        BigInt(feePercent),
        BigInt(slippagePercent),
        additionalFeeReceivers,
      ],
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas, // Usamos el gas limit calculado por el servicio
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
            logger.warn(`[sellToken] TX failed => ${txHash}`);
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
            logger.warn(`[sellToken] TX failed => ${txHash}`);
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
            logger.warn(`[sellToken] TX failed => ${txHash}`);
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
