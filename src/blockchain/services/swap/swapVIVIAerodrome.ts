import {
  Address,
  decodeEventLog,
  formatEther,
  getAddress,
  TransactionReceipt,
} from "viem";
import { SpeedEnum, Wallet } from "@prisma/client";

import { logger } from "@logger";
import { contracts } from "@config";

import { VIVIAerodromeABI } from "@abis";

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
  waitForReceiptWithFallback,
} from "@blockchain";

import { decryptPrivateKey } from "@services";

import { GlobalSceneContext } from "@types";
import { AddressValidator } from "@utils";

const FEE_SWAP_WRAPPER_AERO = getAddress(contracts.FEE_SWAP_WRAPPER_AERO || "");

interface BuyAerodromeArgs {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent: number;
  feePercent: number;
  stable: boolean;
  bestDex: DexQuoteResultBuy;
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
}

export async function buyTokenAerodrome({
  ctx,
  userId,
  walletId,
  tokenAddress,
  amountEth,
  slippagePercent,
  feePercent,
  stable,
  bestDex,
  overrideAdditionalFeeReceivers,
}: BuyAerodromeArgs): Promise<SwapResult> {
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
        `[buyTokenAerodrome] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[buyTokenAerodrome] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[buyTokenAerodrome] User ${userId} has no referrer`);
  }

  // Estimar gas si tenemos bestDex y es Aerodrome
  let estimatedGas: bigint | undefined;
  if (
    bestDex &&
    (bestDex.dexName === "AerodromeStable" ||
      bestDex.dexName === "AerodromeVolatile")
  ) {
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
        `[buyTokenAerodrome] Gas estimado para ${bestDex.dexName}: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[buyTokenAerodrome] Error estimando gas:", err);
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

  const factory = stable
    ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address)
    : ("0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address);

  const routes = [
    {
      from: contracts.ETH as Address,
      to: AddressValidator.parseEthereumAddress(tokenAddress),
      stable,
      factory,
    },
  ];

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPER_AERO,
      abi: VIVIAerodromeABI,
      functionName: "VIVIBuy",
      args: [
        {
          routes,
          amountIn: 0n,
          recipient: getAddress(walletEntity.address),
          deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
        },
        BigInt(feePercent),
        BigInt(slippagePercent),
        additionalFeeReceivers,
      ],
      value: amountEth,
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
      logger.warn(`[buyTokenAerodrome] TX failed => ${txHash}`);
    }

    let tokensBought = 0n;
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({
          abi: VIVIAerodromeABI,
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
        spender: FEE_SWAP_WRAPPER_AERO,
        privateKey,
      }).catch((err) =>
        logger.error("Background ensureAllowance (Aerodrome) failed:", err)
      )
    );

    return receipt;
  })();

  return { txHash, waitReceipt };
}

export async function sellTokenAerodrome({
  ctx,
  userId,
  walletId,
  tokenAddress,
  tokenAmount,
  slippagePercent,
  feePercent,
  stable,
  bestDex,
  estimatedEthValue,
  overrideAdditionalFeeReceivers,
}: {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  tokenAmount: bigint;
  slippagePercent: number;
  feePercent: number;
  stable: boolean;
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
        `[sellTokenAerodrome] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[sellTokenAerodrome] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[sellTokenAerodrome] User ${userId} has no referrer`);
  }

  // Si tenemos bestDex, usamos su valor de salida como estimated ETH value
  if (bestDex && !estimatedEthValue) {
    estimatedEthValue = BigInt(bestDex.amountOut || "0");
  }

  if (estimatedEthValue && estimatedEthValue > 0n) {
    logger.info(
      `[sellTokenAerodrome] Using estimated ETH value for gas calculation: ${formatEther(
        estimatedEthValue
      )} ETH`
    );
  }

  // Estimar gas si tenemos bestDex y es Aerodrome
  let estimatedGas: bigint | undefined;
  if (
    bestDex &&
    (bestDex.dexName === "AerodromeStable" ||
      bestDex.dexName === "AerodromeVolatile")
  ) {
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
        `[sellTokenAerodrome] Gas estimado para ${bestDex.dexName}: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[sellTokenAerodrome] Error estimando gas:", err);
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
    spender: FEE_SWAP_WRAPPER_AERO,
    privateKey,
  });

  const factory = stable
    ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address)
    : ("0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address);

  const routes = [
    {
      from: AddressValidator.parseEthereumAddress(tokenAddress),
      to: contracts.ETH as Address,
      stable,
      factory,
    },
  ];

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPER_AERO,
      abi: VIVIAerodromeABI,
      functionName: "VIVISell",
      args: [
        {
          routes,
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
      logger.warn(`[sellTokenAerodrome] TX failed => ${txHash}`);
    }
    return receipt;
  })();

  return { txHash, waitReceipt };
}
