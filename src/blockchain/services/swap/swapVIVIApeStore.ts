import { Address, decodeEventLog, getAddress, TransactionReceipt } from "viem";
import { SpeedEnum, Wallet } from "@prisma/client";
import axios from "axios";

import { logger } from "@logger";
import { contracts, secrets } from "@config";

import { VIVIApeStoreABI, VIVIApeStoreABI_NEW } from "@abis";
import { checkApeStoreProxyStatus } from "../../../utils/checkApeStoreProxy";

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

const FEE_SWAP_WRAPPER_APESTORE =
  contracts.FEE_SWAP_WRAPPER_APESTORE as Address;
const FEE_SWAP_WRAPPER_APESTORE_NEW =
  contracts.FEE_SWAP_WRAPPER_APESTORE_NEW as Address;

async function getTokenId(tokenAddress: Address): Promise<string> {
  try {
    const response = await fetch(
      `https://api.ape.store/token/8453/${tokenAddress}`,
      {
        method: "GET",
        headers: {
          accept: "text/plain",
          Authorization: `Bearer ${secrets.APESTORE_API_KEY}`,
        },
      }
    );
    logger.info("getTokenId");

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = (await response.json()) as any;
    logger.info(data.id);

    return data.id;
  } catch (error) {
    logger.error(
      `[getTokenId] Error fetching token ID for ${tokenAddress}: ${error}`
    );
    throw new Error(`Failed to fetch token ID for ${tokenAddress}`);
  }
}

async function getTransactionSignature(
  tokenId: number,
  address: string,
  amount: string
): Promise<string> {
  try {
    const response = await axios.post(
      "https://api.ape.store/transaction",
      {
        tokenId,
        address,
        amount,
      },
      {
        headers: {
          accept: "text/plain",
          Authorization: `Bearer ${secrets.APESTORE_API_KEY}`,
        },
      }
    );

    logger.info("getTransactionSignature response received");
    const data = response.data as any;
    logger.info(data);

    return data;
  } catch (error) {
    logger.error(
      `[getTransactionSignature] Error fetching transaction signature for ${tokenId}: ${error}`
    );
    throw new Error(`Failed to fetch transaction signature for ${tokenId}`);
  }
}

interface BuyApeStoreArgs {
  ctx: GlobalSceneContext;
  userId: number;
  walletId?: number;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex?: DexQuoteResultBuy;
}

export async function buyTokenVIVIApeStore({
  ctx,
  userId,
  walletId,
  tokenAddress,
  amountEth,
  slippagePercent,
  feePercent,
  bestDex,
}: BuyApeStoreArgs): Promise<SwapResult> {
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

  // Check referral fee logic
  let additionalFeeReceivers: Array<{ receiver: Address; bps: bigint }> = [];
  if (user?.referredById) {
    const referrer = await ctx.services.userService.getUserById(
      user.referredById
    );
    if (referrer?.rewardWallet) {
      additionalFeeReceivers.push({
        receiver: referrer.rewardWallet as Address,
        bps: 2000n, // 20% of 1% = 2000 bps
      });
      logger.info(
        `[buyTokenVIVIApeStore] Referral fee: ${referrer.rewardWallet} (2000 bps)`
      );
    }
  }

  logger.info(`[buyTokenVIVIApeStore] address ${walletEntity.address}`);
  logger.info(`[buyTokenVIVIApeStore] amt ${amountEth.toString()}`);

  // *** CÁLCULO CORRECTO DE FEES COMO EN HARDHAT ***
  const feeAmount = (amountEth * BigInt(feePercent)) / 10000n;
  const ethForRouter = amountEth - feeAmount;

  logger.info("=== Fee Calculation ===");
  logger.info(`Total ETH: ${amountEth.toString()}`);
  logger.info(`Fee Amount (${feePercent / 100}%): ${feeAmount.toString()}`);
  logger.info(`ETH for Router: ${ethForRouter.toString()}`);

  // Check if new contract is allowed as proxy (moved before signature generation)
  logger.info("[buyTokenVIVIApeStore] Checking ApeStore proxy status...");
  const isNewContractAllowed = await checkApeStoreProxyStatus();
  const contractAddress = isNewContractAllowed
    ? FEE_SWAP_WRAPPER_APESTORE_NEW
    : FEE_SWAP_WRAPPER_APESTORE;
  const contractABI = isNewContractAllowed
    ? VIVIApeStoreABI_NEW
    : VIVIApeStoreABI;

  logger.info(
    `[buyTokenVIVIApeStore] Using contract: ${
      isNewContractAllowed ? "NEW" : "OLD"
    } (${contractAddress})`
  );

  const tokenId = await getTokenId(tokenAddress);
  logger.info(
    `[buyTokenVIVIApeStore] TokenId for ${tokenAddress} is ${tokenId}`
  );

  // *** USAR ethForRouter PARA LA SIGNATURE (NO amountEth TOTAL) ***
  const signature = await getTransactionSignature(
    Number(tokenId),
    contractAddress, // Use the correct contract address based on proxy status
    ethForRouter.toString() // ¡CAMBIO CRÍTICO!
  );

  logger.info(
    `[buyTokenVIVIApeStore] Signature for ${tokenAddress} is ${signature}`
  );

  // Estimate gas if we have bestDex information
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "ApeStore") {
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
        `[buyTokenVIVIApeStore] Gas estimado para ApeStore: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[buyTokenVIVIApeStore] Error estimando gas:", err);
    }
  }

  const gasOverrides = await getGasOverridesForSpeed(
    userSpeed,
    publicClientQuickNode,
    {
      ethValue: amountEth,
      operationType: "BUY",
      estimatedGas,
    }
  );

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: contractAddress,
      abi: contractABI,
      functionName: "VIVIBuy",
      args: isNewContractAllowed
        ? [
            {
              token: tokenAddress,
              minOut: 0n,
              signature: signature,
              recipient: getAddress(walletEntity.address),
            },
            BigInt(feePercent),
            additionalFeeReceivers,
          ]
        : [
            {
              token: tokenAddress,
              minOut: 0n,
              signature: signature,
              recipient: getAddress(walletEntity.address),
            },
            BigInt(feePercent),
          ],
      value: amountEth,
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas,
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
            logger.warn(`[buyTokenVIVIApeStore] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: VIVIApeStoreABI,
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
              spender: contractAddress,
              privateKey,
            }).catch((err) =>
              logger.error(
                "Background ensureAllowance (VIVI ApeStore) failed:",
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
            logger.warn(`[buyTokenVIVIApeStore] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: contractABI,
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
              spender: contractAddress,
              privateKey,
            }).catch((err) =>
              logger.error(
                "Background ensureAllowance (VIVI ApeStore) failed:",
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
            logger.warn(`[buyTokenVIVIApeStore] TX failed => ${txHash}`);
          }

          let tokensBought = 0n;
          for (const log of receipt.logs) {
            try {
              const event = decodeEventLog({
                abi: contractABI,
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
              spender: contractAddress,
              privateKey,
            }).catch((err) =>
              logger.error(
                "Background ensureAllowance (VIVI ApeStore) failed:",
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

    throw new Error(`Transaction receipt not found after ${MAX_WAIT_TIME}ms`);
  })();

  return { txHash, waitReceipt };
}

export async function sellTokenVIVIApeStore({
  ctx,
  userId,
  walletId,
  tokenAddress,
  tokenAmount,
  slippagePercent,
  feePercent,
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
  bestDex?: DexQuoteResultSell;
  estimatedEthValue?: bigint;
}): Promise<SwapResult> {
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

  // Check referral fee logic
  let additionalFeeReceivers: Array<{ receiver: Address; bps: bigint }> = [];
  if (user?.referredById) {
    const referrer = await ctx.services.userService.getUserById(
      user.referredById
    );
    if (referrer?.rewardWallet) {
      additionalFeeReceivers.push({
        receiver: referrer.rewardWallet as Address,
        bps: 2000n, // 20% of 1% = 2000 bps
      });
      logger.info(
        `[sellTokenVIVIApeStore] Referral fee: ${referrer.rewardWallet} (2000 bps)`
      );
    }
  }

  // Si tenemos bestDex, usamos su valor de salida como estimated ETH value
  if (bestDex && !estimatedEthValue) {
    estimatedEthValue = BigInt(bestDex.amountOut || "0");
  }

  // Estimate gas if we have bestDex information
  let estimatedGas: bigint | undefined;
  if (bestDex && bestDex.dexName === "ApeStore") {
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
        `[sellTokenVIVIApeStore] Gas estimado para ApeStore: ${estimatedGas}`
      );
    } catch (err) {
      logger.error("[sellTokenVIVIApeStore] Error estimando gas:", err);
    }
  }

  // Check if new contract is allowed as proxy
  logger.info("[sellTokenVIVIApeStore] Checking ApeStore proxy status...");
  const isNewContractAllowed = await checkApeStoreProxyStatus();
  const contractAddress = isNewContractAllowed
    ? FEE_SWAP_WRAPPER_APESTORE_NEW
    : FEE_SWAP_WRAPPER_APESTORE;
  const contractABI = isNewContractAllowed
    ? VIVIApeStoreABI_NEW
    : VIVIApeStoreABI;

  logger.info(
    `[sellTokenVIVIApeStore] Using contract: ${
      isNewContractAllowed ? "NEW" : "OLD"
    } (${contractAddress})`
  );

  const gasOverrides = await getGasOverridesForSpeed(
    userSpeed,
    publicClientQuickNode,
    {
      ethValue: estimatedEthValue,
      operationType: "SELL",
      estimatedGas,
    }
  );

  await ensureAllowanceLogic(ctx, {
    walletEntity,
    tokenAddress,
    requiredAmount: tokenAmount,
    spender: contractAddress,
    privateKey,
  });

  const tokenId = await getTokenId(tokenAddress);
  const signature = await getTransactionSignature(
    Number(tokenId),
    contractAddress, // Use the correct contract address based on proxy status
    tokenAmount.toString()
  );

  const { txHash } = await writeContractWithRetries({
    walletClient,
    request: {
      address: contractAddress,
      abi: contractABI,
      functionName: "VIVISell",
      args: isNewContractAllowed
        ? [
            {
              token: tokenAddress,
              amount: tokenAmount,
              minOut: 0n,
              signature: signature as `0x${string}`,
              recipient: getAddress(walletEntity.address),
            },
            BigInt(feePercent),
            additionalFeeReceivers,
          ]
        : [
            {
              token: tokenAddress,
              amount: tokenAmount,
              minOut: 0n,
              signature: signature as `0x${string}`,
              recipient: getAddress(walletEntity.address),
            },
            BigInt(feePercent),
          ],
      maxFeePerGas: gasOverrides.maxFeePerGas,
      maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
      gas: gasOverrides.gas,
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
            logger.warn(`[sellTokenVIVIApeStore] TX failed => ${txHash}`);
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
            logger.warn(`[sellTokenVIVIApeStore] TX failed => ${txHash}`);
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
            logger.warn(`[sellTokenVIVIApeStore] TX failed => ${txHash}`);
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

    throw new Error(`Transaction receipt not found after ${MAX_WAIT_TIME}ms`);
  })();

  return { txHash, waitReceipt };
}
