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
  waitForReceiptWithFallback,
  SwapResult,
} from "@blockchain";

import { decryptPrivateKey } from "@services";

import { GlobalSceneContext } from "@types";
import { AddressValidator } from "@utils";

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
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
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
  overrideAdditionalFeeReceivers,
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

  // ─────────────────────────────────────────────────────────────
  // CHECK REFERRAL AND GET REWARD WALLET
  // ─────────────────────────────────────────────────────────────
  let additionalFeeReceivers: Array<{ receiver: Address; bps: bigint }> = [];

  if (overrideAdditionalFeeReceivers) {
    additionalFeeReceivers = overrideAdditionalFeeReceivers;
  } else if (user?.referredById) {
    // Get the referrer user to check if they have a reward wallet
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
        `[buyTokenV3] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[buyTokenV3] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[buyTokenV3] User ${userId} has no referrer`);
  }

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
        additionalFeeReceivers,
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
        additionalFeeReceivers,
      ],
      value: amountEth,
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas, // Usamos el gas limit dinámico
    },
    maxRetries: 3,
  });
  if (!txHash || txHash.length !== 66) {
    throw new Error(`Invalid tx hash returned by write: ${txHash}`);
  }
  const waitReceipt = (async (): Promise<TransactionReceipt> => {
    const receipt = await waitForReceiptWithFallback({
      txHash,
      primaryClient: publicClientQuickNode,
      fallbackClients: [publicClientDRPC, publicClientBaseOficial],
      firstPhaseMs: 5000,
      maxWaitMs: 180000,
      pollIntervalMs: 500,
    });

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
  overrideAdditionalFeeReceivers,
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
    // Get the referrer user to check if they have a reward wallet
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
        `[sellTokenV3] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[sellTokenV3] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[sellTokenV3] User ${userId} has no referrer`);
  }

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
        additionalFeeReceivers,
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
        additionalFeeReceivers,
      ],
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas, // Gas limit dinámico
    },
    maxRetries: 3,
  });
  if (!txHash || txHash.length !== 66) {
    throw new Error(`Invalid tx hash returned by write: ${txHash}`);
  }

  const waitReceipt = (async (): Promise<TransactionReceipt> => {
    const receipt = await waitForReceiptWithFallback({
      txHash,
      primaryClient: publicClientQuickNode,
      fallbackClients: [publicClientDRPC, publicClientBaseOficial],
      firstPhaseMs: 5000,
      maxWaitMs: 180000,
      pollIntervalMs: 500,
    });
    if (receipt.status === "reverted") {
      logger.warn(`[sellTokenV3] TX failed => ${txHash}`);
    }
    return receipt;
  })();

  return { txHash, waitReceipt };
}
