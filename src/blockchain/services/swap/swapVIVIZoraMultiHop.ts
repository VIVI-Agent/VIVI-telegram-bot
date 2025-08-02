import { Address, formatEther, getAddress, TransactionReceipt } from "viem";
import { SpeedEnum, Wallet } from "@prisma/client";

import { AddressValidator } from "@utils";
import { logger } from "@logger";
import { contracts } from "@config";

import { VIVIZoraMultiHopABI } from "@abis";

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

const FEE_SWAP_WRAPPER_ZORA = getAddress(contracts.FEE_SWAP_WRAPPER_ZORA || "");

interface BuyZoraMultiHopArgs {
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

export async function buyTokenZoraMultiHop({
  ctx,
  userId,
  walletId,
  tokenAddress,
  amountEth,
  slippagePercent,
  feePercent,
  bestDex,
  overrideAdditionalFeeReceivers,
}: BuyZoraMultiHopArgs): Promise<SwapResult> {
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
        `[buyTokenZoraMultiHop] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[buyTokenZoraMultiHop] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[buyTokenZoraMultiHop] User ${userId} has no referrer`);
  }

  // Estimar gas si tenemos bestDex y es ZoraMultiHop
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "ZoraMultiHop") {
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
        `[buyTokenZoraMultiHop] Gas estimado para ${bestDex.dexName}: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[buyTokenZoraMultiHop] Error estimando gas:", err);
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

  // Calcular amountOutMinimum basado en slippage
  const expectedAmountOut = BigInt(bestDex.amountOut || "0");
  const slippageBigInt = BigInt(Math.floor(slippagePercent * 100)); // Convert to basis points
  const amountOutMinimum =
    (expectedAmountOut * (10000n - slippageBigInt)) / 10000n;

  // Create deadline (current time + 20 minutes)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPER_ZORA,
      abi: VIVIZoraMultiHopABI,
      functionName: "VIVIZoraBuy",
      args: [
        {
          tokenTarget: AddressValidator.parseEthereumAddress(tokenAddress),
          recipient: getAddress(walletEntity.address),
          deadline: deadline,
          amountOutMin: amountOutMinimum,
          amountIn: amountEth,
        },
        feePercent,
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
            logger.warn(`[buyTokenZoraMultiHop] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              // Note: We would need to define the proper event in the ABI
              // For now, we'll use a generic approach to extract token amounts
              if (log.address.toLowerCase() === tokenAddress.toLowerCase()) {
                // This is a Transfer event from the target token
                // We can decode it as a standard ERC20 Transfer
                const transferSignature =
                  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
                if (log.topics[0] === transferSignature) {
                  // Third parameter is the amount
                  tokensBought = BigInt(log.data);
                }
              }
            } catch {}
          }

          // Ensure allowance for future operations if tokens were bought
          if (tokensBought > 0n) {
            setImmediate(() =>
              ensureAllowanceLogic(ctx, {
                walletEntity,
                tokenAddress,
                requiredAmount: tokensBought,
                spender: FEE_SWAP_WRAPPER_ZORA,
                privateKey,
              }).catch((err) =>
                logger.error(
                  "Background ensureAllowance (ZoraMultiHop) failed:",
                  err
                )
              )
            );
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
            logger.warn(`[buyTokenZoraMultiHop] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              if (log.address.toLowerCase() === tokenAddress.toLowerCase()) {
                const transferSignature =
                  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
                if (log.topics[0] === transferSignature) {
                  tokensBought = BigInt(log.data);
                }
              }
            } catch {}
          }

          if (tokensBought > 0n) {
            setImmediate(() =>
              ensureAllowanceLogic(ctx, {
                walletEntity,
                tokenAddress,
                requiredAmount: tokensBought,
                spender: FEE_SWAP_WRAPPER_ZORA,
                privateKey,
              }).catch((err) =>
                logger.error(
                  "Background ensureAllowance (ZoraMultiHop) failed:",
                  err
                )
              )
            );
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
            logger.warn(`[buyTokenZoraMultiHop] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              if (log.address.toLowerCase() === tokenAddress.toLowerCase()) {
                const transferSignature =
                  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
                if (log.topics[0] === transferSignature) {
                  tokensBought = BigInt(log.data);
                }
              }
            } catch {}
          }

          if (tokensBought > 0n) {
            setImmediate(() =>
              ensureAllowanceLogic(ctx, {
                walletEntity,
                tokenAddress,
                requiredAmount: tokensBought,
                spender: FEE_SWAP_WRAPPER_ZORA,
                privateKey,
              }).catch((err) =>
                logger.error(
                  "Background ensureAllowance (ZoraMultiHop) failed:",
                  err
                )
              )
            );
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

export async function sellTokenZoraMultiHop({
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
        `[sellTokenZoraMultiHop] Referral fee will be sent to: ${referrer.rewardWallet} (2000 bps)`
      );
    } else {
      logger.info(
        `[sellTokenZoraMultiHop] Referrer ${user.referredById} has no reward wallet configured`
      );
    }
  } else {
    logger.info(`[sellTokenZoraMultiHop] User ${userId} has no referrer`);
  }

  // Si tenemos bestDex, usamos su valor de salida como estimated ETH value
  if (bestDex && !estimatedEthValue) {
    estimatedEthValue = BigInt(bestDex.amountOut || "0");
  }

  if (estimatedEthValue && estimatedEthValue > 0n) {
    logger.info(
      `[sellTokenZoraMultiHop] Using estimated ETH value for gas calculation: ${formatEther(
        estimatedEthValue
      )} ETH`
    );
  }

  // Estimar gas si tenemos bestDex y es ZoraMultiHop
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "ZoraMultiHop") {
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
        `[sellTokenZoraMultiHop] Gas estimado para ${bestDex.dexName}: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[sellTokenZoraMultiHop] Error estimando gas:", err);
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
    spender: FEE_SWAP_WRAPPER_ZORA,
    privateKey,
  });

  // Calcular amountOutMinimum basado en slippage
  const expectedAmountOut = BigInt(bestDex?.amountOut || "0");
  const slippageBigInt = BigInt(Math.floor(slippagePercent * 100)); // Convert to basis points
  const amountOutMinimum =
    (expectedAmountOut * (10000n - slippageBigInt)) / 10000n;

  // Create deadline (current time + 20 minutes)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: FEE_SWAP_WRAPPER_ZORA,
      abi: VIVIZoraMultiHopABI,
      functionName: "VIVIZoraSell",
      args: [
        {
          tokenTarget: AddressValidator.parseEthereumAddress(tokenAddress),
          recipient: getAddress(walletEntity.address),
          deadline: deadline,
          amountOutMin: amountOutMinimum,
          amountIn: tokenAmount,
        },
        feePercent,
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
            logger.warn(`[sellTokenZoraMultiHop] TX failed => ${txHash}`);
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
            logger.warn(`[sellTokenZoraMultiHop] TX failed => ${txHash}`);
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
            logger.warn(`[sellTokenZoraMultiHop] TX failed => ${txHash}`);
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
