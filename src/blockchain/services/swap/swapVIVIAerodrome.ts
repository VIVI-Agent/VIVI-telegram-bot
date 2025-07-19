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
  if (user?.referredById) {
    const referrer = await ctx.services.userService.getUserById(
      user.referredById
    );
    if (referrer?.rewardWallet) {
      additionalFeeReceivers = [
        {
          receiver: getAddress(referrer.rewardWallet),
          bps: 2000n,
        },
      ];
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
              logger.error(
                "Background ensureAllowance (Aerodrome) failed:",
                err
              )
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
              logger.error(
                "Background ensureAllowance (Aerodrome) failed:",
                err
              )
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
              logger.error(
                "Background ensureAllowance (Aerodrome) failed:",
                err
              )
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
  if (user?.referredById) {
    const referrer = await ctx.services.userService.getUserById(
      user.referredById
    );
    if (referrer?.rewardWallet) {
      additionalFeeReceivers = [
        {
          receiver: getAddress(referrer.rewardWallet),
          bps: 2000n,
        },
      ];
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
            logger.warn(`[sellTokenAerodrome] TX failed => ${txHash}`);
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
            logger.warn(`[sellTokenAerodrome] TX failed => ${txHash}`);
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
            logger.warn(`[sellTokenAerodrome] TX failed => ${txHash}`);
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
