import { Address, formatEther, getAddress } from "viem";
import { SpeedEnum, Wallet } from "@prisma/client";

import { AddressValidator } from "@utils";
import { logger } from "@logger";
import { contracts } from "@config";

import { VIVIVirtualsHopABI } from "@abis";

import { publicClientQuickNode, getUserWalletClientQuickNode } from "@client";

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

interface BuyVirtualTokenArgs {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex?: DexQuoteResultBuy;
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
}

interface SellVirtualTokenArgs {
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
}

export async function buyTokenVirtualToken({
  ctx,
  userId,
  walletId,
  tokenAddress,
  amountEth,
  slippagePercent,
  feePercent,
  bestDex,
  overrideAdditionalFeeReceivers,
}: BuyVirtualTokenArgs): Promise<SwapResult> {
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
        `[buyTokenVirtualToken] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[buyTokenVirtualToken] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[buyTokenVirtualToken] User ${userId} has no referrer`);
  }

  // Estimar gas si tenemos bestDex y es VirtualToken
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "VirtualToken") {
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
      logger.info(
        `[buyTokenVirtualToken] Gas estimado para ${bestDex.dexName}: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[buyTokenVirtualToken] Error estimando gas:", err);
    }
  }

  // Optimizado: pasamos el valor de ETH y tipo de operación
  const gasOverrides = await getGasOverridesForSpeed(
    userSpeed,
    publicClientQuickNode,
    {
      ethValue: amountEth,
      operationType: "BUY",
      estimatedGas,
    }
  );

  logger.info(
    `[buyTokenVirtualToken] token=${tokenAddress}, eth=${formatEther(
      amountEth
    )}, slip=${slippagePercent}, fee=${feePercent}, stable=VirtualToken`
  );

  // Create deadline (current time + 20 minutes)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  try {
    const { txHash } = await writeContractWithRetries({
      walletClient,
      request: {
        address: contracts.FEE_SWAP_WRAPPER_VIRTUAL as Address,
        abi: VIVIVirtualsHopABI,
        functionName: "VIVIVirtualsBuy",
        args: [
          {
            tokenTarget: AddressValidator.parseEthereumAddress(tokenAddress),
            recipient: getAddress(walletEntity.address),
            deadline: deadline,
            slippagePercent: BigInt(slippagePercent),
            amountIn: amountEth,
          },
          BigInt(feePercent),
          additionalFeeReceivers,
        ],
        value: amountEth,
        maxFeePerGas: gasOverrides.maxFeePerGas,
        maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
        gas: gasOverrides.gas,
      },
      maxRetries: 3,
    });

    logger.info(`[buyTokenVirtualToken] TX enviada: ${txHash}`);

    const waitReceipt = publicClientQuickNode.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    });

    return { txHash, waitReceipt };
  } catch (error) {
    logger.error(`[buyTokenVirtualToken] Error en transacción:`, error);
    throw error;
  }
}

export async function sellTokenVirtualToken({
  ctx,
  userId,
  walletId,
  tokenAddress,
  tokenAmount,
  slippagePercent,
  feePercent,
  bestDex,
  estimatedEthValue,
  overrideAdditionalFeeReceivers,
}: SellVirtualTokenArgs): Promise<SwapResult> {
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
        `[sellTokenVirtualToken] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[sellTokenVirtualToken] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[sellTokenVirtualToken] User ${userId} has no referrer`);
  }

  // Si tenemos bestDex, usamos su valor de salida como estimated ETH value
  if (bestDex && !estimatedEthValue) {
    estimatedEthValue = BigInt(bestDex.amountOut || "0");
  }

  if (estimatedEthValue && estimatedEthValue > 0n) {
    logger.info(
      `[sellTokenVirtualToken] Using estimated ETH value for gas calculation: ${formatEther(
        estimatedEthValue
      )} ETH`
    );
  }

  // Estimar gas si tenemos bestDex y es VirtualToken
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "VirtualToken") {
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
      logger.info(
        `[sellTokenVirtualToken] Gas estimado para ${bestDex.dexName}: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[sellTokenVirtualToken] Error estimando gas:", err);
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

  // ─────────────────────────────────────────────────────────────
  // ENSURE ALLOWANCE
  // ─────────────────────────────────────────────────────────────
  logger.info(
    `[sellTokenVirtualToken] Asegurando allowance para token ${tokenAddress}`
  );
  await ensureAllowanceLogic(ctx, {
    walletEntity,
    tokenAddress,
    requiredAmount: tokenAmount,
    spender: contracts.FEE_SWAP_WRAPPER_VIRTUAL as Address,
    privateKey,
  });

  logger.info(
    `[sellTokenVirtualToken] token=${tokenAddress}, amount=${tokenAmount}, slip=${slippagePercent}, fee=${feePercent}`
  );

  // Create deadline (current time + 20 minutes)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  try {
    const { txHash } = await writeContractWithRetries({
      walletClient,
      request: {
        address: contracts.FEE_SWAP_WRAPPER_VIRTUAL as Address,
        abi: VIVIVirtualsHopABI,
        functionName: "VIVIVirtualsSell",
        args: [
          {
            tokenTarget: AddressValidator.parseEthereumAddress(tokenAddress),
            recipient: getAddress(walletEntity.address),
            deadline: deadline,
            slippagePercent: BigInt(slippagePercent),
            amountIn: tokenAmount,
          },
          BigInt(feePercent),
          additionalFeeReceivers,
        ],
        maxFeePerGas: gasOverrides.maxFeePerGas,
        maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
        gas: gasOverrides.gas,
      },
      maxRetries: 3,
    });

    logger.info(`[sellTokenVirtualToken] TX enviada: ${txHash}`);

    const waitReceipt = publicClientQuickNode.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    });

    return { txHash, waitReceipt };
  } catch (error) {
    logger.error(`[sellTokenVirtualToken] Error en transacción:`, error);
    throw error;
  }
}
