// src/blockchain/services/swap/v4/wrapperService.ts
import { Address, Hex } from "viem";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { DexQuoteResultBuy } from "../../priceComparison/priceComparisonService";
import { DexQuoteResultSell } from "../../priceComparison/priceComparisonServiceSell";
import { decryptPrivateKey } from "@services";
import { contracts } from "@config";
import {
  estimateBuyGas,
  estimateSellGas,
} from "../../gasEstimation/gasEstimation";
import {
  publicClientDRPC,
  publicClientQuickNode,
  getUserWalletClientQuickNode,
} from "@client";
import {
  SwapResult,
  V4IntegratedBuyParams,
  V4IntegratedSellParams,
} from "../types";
import { AddressValidator } from "@utils";
import {
  executeV4IntegratedBuy,
  executeV4IntegratedSell,
} from "./integratedService";

export async function buyTokenV4(params: {
  ctx: GlobalSceneContext;
  userId: number;
  walletId: number;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex: DexQuoteResultBuy;
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
}): Promise<SwapResult> {
  const {
    ctx,
    userId,
    walletId,
    tokenAddress,
    amountEth,
    slippagePercent,
    feePercent,
    bestDex,
    overrideAdditionalFeeReceivers,
  } = params;

  logger.info(`[V4:Wrapper] Buy ${amountEth} ETH → ${tokenAddress}`);

  const walletEntity = await ctx.services.walletService.getWalletById(walletId);
  if (!walletEntity) throw new Error(`Wallet ${walletId} not found`);

  const privateKey = decryptPrivateKey(walletEntity.encryptedPrivKey) as Hex;
  const feeBps = BigInt(Math.round(feePercent));

  try {
    const estimatedGas = await estimateBuyGas({
      publicClient: publicClientDRPC,
      bestDex,
      walletAddress: walletEntity.address as Address,
      tokenAddress,
      amountEth,
      slippagePercent,
      feePercent,
      additionalFeeReceivers: overrideAdditionalFeeReceivers || [],
    });
    logger.info(`[V4:Wrapper] Estimated gas: ${estimatedGas}`);
  } catch (e) {
    logger.warn(`[V4:Wrapper] Gas estimation failed: ${e}`);
  }

  const user = await ctx.services.userService.getUserById(userId);
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
      if (rewardWallet)
        additionalFeeReceivers = [{ receiver: rewardWallet, bps: 2000n }];
    }
  }

  const v4Params: V4IntegratedBuyParams = {
    ctx,
    walletEntity,
    privateKey,
    contractAddress: contracts.FEE_SWAP_WRAPPER_V4_ZORA_HOOK as Address,
    tokenAddress,
    ethAmount: amountEth,
    feeBps,
    slippagePercent,
    additionalFeeReceivers,
  };
  const result = await executeV4IntegratedBuy(v4Params);
  if (!result?.hash || result.hash.length !== 66) {
    throw new Error(`Invalid tx hash returned by V4 buy: ${result?.hash}`);
  }
  const walletClient = getUserWalletClientQuickNode(privateKey);
  return {
    txHash: result.hash,
    waitReceipt: publicClientQuickNode.waitForTransactionReceipt({
      hash: result.hash as `0x${string}`,
    }),
  };
}

export async function sellTokenV4(params: {
  ctx: GlobalSceneContext;
  userId: number;
  walletId: number;
  tokenAddress: Address;
  tokenAmount: bigint;
  slippagePercent: number;
  feePercent: number;
  bestDex: DexQuoteResultSell;
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>;
}): Promise<SwapResult> {
  const {
    ctx,
    userId,
    walletId,
    tokenAddress,
    tokenAmount,
    slippagePercent,
    feePercent,
    bestDex,
    overrideAdditionalFeeReceivers,
  } = params;

  logger.info(`[V4:Wrapper] Sell ${tokenAmount} ${tokenAddress} → ETH`);

  const walletEntity = await ctx.services.walletService.getWalletById(walletId);
  if (!walletEntity) throw new Error(`Wallet ${walletId} not found`);

  const tokenData = await ctx.services.tokenService.getTokenByAddress(
    tokenAddress
  );
  if (!tokenData) throw new Error(`Token ${tokenAddress} not found`);

  const privateKey = decryptPrivateKey(walletEntity.encryptedPrivKey) as Hex;
  const feeBps = BigInt(Math.round(feePercent));

  try {
    const estimatedGas = await estimateSellGas({
      publicClient: publicClientDRPC,
      bestDex,
      walletAddress: walletEntity.address as Address,
      tokenAddress,
      tokenAmount,
      slippagePercent,
      feePercent,
      additionalFeeReceivers: overrideAdditionalFeeReceivers || [],
    });
    logger.info(`[V4:Wrapper] Estimated gas: ${estimatedGas}`);
  } catch (e) {
    logger.warn(`[V4:Wrapper] Gas estimation failed: ${e}`);
  }

  const user = await ctx.services.userService.getUserById(userId);
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
      if (rewardWallet)
        additionalFeeReceivers = [{ receiver: rewardWallet, bps: 2000n }];
    }
  }

  const v4Params: V4IntegratedSellParams = {
    ctx,
    walletEntity,
    privateKey,
    contractAddress: contracts.FEE_SWAP_WRAPPER_V4_ZORA_HOOK as Address,
    tokenAddress,
    tokenAmount,
    feeBps,
    slippagePercent,
    decimalsIn: tokenData.decimals,
    additionalFeeReceivers,
  };
  const result = await executeV4IntegratedSell(v4Params);
  if (!result?.hash || result.hash.length !== 66) {
    throw new Error(`Invalid tx hash returned by V4 sell: ${result?.hash}`);
  }
  const walletClient = getUserWalletClientQuickNode(privateKey);
  return {
    txHash: result.hash,
    waitReceipt: publicClientQuickNode.waitForTransactionReceipt({
      hash: result.hash as `0x${string}`,
    }),
  };
}
