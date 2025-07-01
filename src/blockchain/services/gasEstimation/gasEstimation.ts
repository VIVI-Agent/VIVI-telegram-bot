// src/services/gasEstimation.ts
import { Address, getAddress, PublicClient } from "viem";

import { contracts } from "@config";
import { logger } from "@logger";
import { DexQuoteResultBuy, DexQuoteResultSell } from "@blockchain";

import {
  VIVIUniswapV2ABI,
  VIVIUniswapV3ABI,
  VIVIAerodromeABI,
  VIVIZoraMultiHopABI,
  VIVIVirtualsHopABI,
} from "@abis";

export async function estimateBuyGas({
  publicClient,
  bestDex,
  walletAddress,
  tokenAddress,
  amountEth,
  slippagePercent = 1,
  feePercent = 100,
}: {
  publicClient: PublicClient;
  bestDex: DexQuoteResultBuy;
  walletAddress: Address;
  tokenAddress: Address;
  amountEth: bigint;
  slippagePercent?: number;
  feePercent?: number;
}): Promise<bigint> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  const dexName = bestDex.dexName;
  const feeTier = bestDex.feeTier || 3000;

  try {
    logger.info(
      `[estimateBuyGas] Estimando gas para ${dexName} con ${amountEth} ETH`
    );

    if (dexName === "UniswapV2") {
      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER as Address,
        abi: VIVIUniswapV2ABI,
        functionName: "VIVIBuy",
        args: [
          {
            path: [contracts.ETH as Address, getAddress(tokenAddress)],
            amountIn: 0n,
            recipient: walletAddress,
            deadline,
          },
          BigInt(feePercent),
          BigInt(slippagePercent),
        ],
        account: walletAddress,
        value: amountEth,
      });
    } else if (dexName === "UniswapV3") {
      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPERV3 as Address,
        abi: VIVIUniswapV3ABI,
        functionName: "VIVIBuy",
        args: [
          {
            tokenIn: contracts.ETH as Address,
            tokenOut: getAddress(tokenAddress),
            feeTier,
            amountIn: 0n,
            recipient: walletAddress,
            deadline,
            amountOutMin: 0n,
          },
          BigInt(feePercent),
        ],
        account: walletAddress,
        value: amountEth,
      });
    } else if (
      dexName === "AerodromeVolatile" ||
      dexName === "AerodromeStable"
    ) {
      const stable = dexName === "AerodromeStable";
      const factory = stable
        ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address)
        : ("0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address);

      const routes = [
        {
          from: contracts.ETH as Address,
          to: getAddress(tokenAddress),
          stable,
          factory,
        },
      ];

      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER_AERO as Address,
        abi: VIVIAerodromeABI,
        functionName: "VIVIBuy",
        args: [
          {
            routes,
            amountIn: 0n,
            recipient: walletAddress,
            deadline,
          },
          BigInt(feePercent),
          BigInt(slippagePercent),
        ],
        account: walletAddress,
        value: amountEth,
      });
    } else if (dexName === "ZoraMultiHop") {
      // Create deadline (current time + 20 minutes)
      const zoraBuyDeadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER_ZORA as Address,
        abi: VIVIZoraMultiHopABI,
        functionName: "VIVIZoraBuy",
        args: [
          {
            tokenTarget: getAddress(tokenAddress),
            recipient: walletAddress,
            deadline: zoraBuyDeadline,
            amountOutMin: 1n, // minimal for estimation
            amountIn: amountEth,
          },
          BigInt(feePercent),
        ],
        account: walletAddress,
        value: amountEth,
      });
    } else if (dexName === "VirtualToken") {
      // Create deadline (current time + 20 minutes)
      const virtualBuyDeadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER_VIRTUAL as Address,
        abi: VIVIVirtualsHopABI,
        functionName: "VIVIVirtualsBuy",
        args: [
          {
            tokenTarget: getAddress(tokenAddress),
            recipient: walletAddress,
            deadline: virtualBuyDeadline,
            slippagePercent: BigInt(slippagePercent), // Direct percentage (5% = 5)
            amountIn: amountEth,
          },
          BigInt(feePercent),
        ],
        account: walletAddress,
        value: amountEth,
      });
    }

    throw new Error("DEX no soportado para estimación de gas");
  } catch (error) {
    logger.error(
      `[estimateBuyGas] Error estimando gas para ${dexName}:`,
      error
    );
    // En caso de error, devolver un valor predeterminado seguro
    return 300000n; // 300k unidades de gas como safe fallback
  }
}

export async function estimateSellGas({
  publicClient,
  bestDex,
  walletAddress,
  tokenAddress,
  tokenAmount,
  slippagePercent = 1,
  feePercent = 100,
}: {
  publicClient: PublicClient;
  bestDex: DexQuoteResultSell;
  walletAddress: Address;
  tokenAddress: Address;
  tokenAmount: bigint;
  slippagePercent?: number;
  feePercent?: number;
}): Promise<bigint> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  const dexName = bestDex.dexName;
  const feeTier = bestDex.feeTier || 3000;
  const estimatedEthValue = BigInt(bestDex.amountOut || "0");

  try {
    logger.info(
      `[estimateSellGas] Estimando gas para ${dexName} con ${tokenAmount} tokens`
    );

    if (dexName === "UniswapV2") {
      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER as Address,
        abi: VIVIUniswapV2ABI,
        functionName: "VIVISell",
        args: [
          {
            path: [getAddress(tokenAddress), contracts.ETH as Address],
            amountIn: tokenAmount,
            recipient: walletAddress,
            deadline,
          },
          BigInt(feePercent),
          BigInt(slippagePercent),
        ],
        account: walletAddress,
      });
    } else if (dexName === "UniswapV3") {
      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPERV3 as Address,
        abi: VIVIUniswapV3ABI,
        functionName: "VIVISell",
        args: [
          {
            tokenIn: getAddress(tokenAddress),
            tokenOut: contracts.ETH as Address,
            feeTier,
            amountIn: tokenAmount,
            recipient: walletAddress,
            deadline,
            amountOutMin: 1n,
          },
          BigInt(feePercent),
        ],
        account: walletAddress,
      });
    } else if (
      dexName === "AerodromeVolatile" ||
      dexName === "AerodromeStable"
    ) {
      const stable = dexName === "AerodromeStable";
      const factory = stable
        ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address)
        : ("0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address);

      const routes = [
        {
          from: getAddress(tokenAddress),
          to: contracts.ETH as Address,
          stable,
          factory,
        },
      ];

      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER_AERO as Address,
        abi: VIVIAerodromeABI,
        functionName: "VIVISell",
        args: [
          {
            routes,
            amountIn: tokenAmount,
            recipient: walletAddress,
            deadline,
          },
          BigInt(feePercent),
          BigInt(slippagePercent),
        ],
        account: walletAddress,
      });
    } else if (dexName === "ZoraMultiHop") {
      // Create deadline (current time + 20 minutes)
      const zoraSellDeadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER_ZORA as Address,
        abi: VIVIZoraMultiHopABI,
        functionName: "VIVIZoraSell",
        args: [
          {
            tokenTarget: getAddress(tokenAddress),
            recipient: walletAddress,
            deadline: zoraSellDeadline,
            amountOutMin: 1n, // minimal for estimation
            amountIn: tokenAmount,
          },
          BigInt(feePercent),
        ],
        account: walletAddress,
      });
    } else if (dexName === "VirtualToken") {
      // Create deadline (current time + 20 minutes)
      const virtualSellDeadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      return await publicClient.estimateContractGas({
        address: contracts.FEE_SWAP_WRAPPER_VIRTUAL as Address,
        abi: VIVIVirtualsHopABI,
        functionName: "VIVIVirtualsSell",
        args: [
          {
            tokenTarget: getAddress(tokenAddress),
            recipient: walletAddress,
            deadline: virtualSellDeadline,
            slippagePercent: BigInt(slippagePercent), // Direct percentage (5% = 5)
            amountIn: tokenAmount,
          },
          BigInt(feePercent),
        ],
        account: walletAddress,
      });
    }

    throw new Error("DEX no soportado para estimación de gas");
  } catch (error) {
    logger.error(
      `[estimateSellGas] Error estimando gas para ${dexName}:`,
      error
    );
    // En caso de error, devolver un valor predeterminado seguro
    return 300000n; // 300k unidades de gas como safe fallback
  }
}

/**
 * Estimate gas for a simple ETH transfer
 */
export async function estimateETHTransferGas({
  publicClient,
  fromAddress,
  toAddress,
  amountWei,
}: {
  publicClient: PublicClient;
  fromAddress: Address;
  toAddress: Address;
  amountWei: bigint;
}): Promise<bigint> {
  try {
    logger.info(
      `[estimateETHTransferGas] Estimating gas for ETH transfer from ${fromAddress} to ${toAddress}`
    );

    const estimatedGas = await publicClient.estimateGas({
      account: fromAddress,
      to: toAddress,
      value: amountWei,
    });

    logger.info(
      `[estimateETHTransferGas] Estimated gas: ${estimatedGas} units`
    );

    return estimatedGas;
  } catch (error) {
    logger.error(
      "[estimateETHTransferGas] Error estimating gas for ETH transfer:",
      error
    );
    // En caso de error, devolver un valor predeterminado seguro para transferencias ETH (21,000 + margen)
    return 25000n; // 25k unidades de gas como safe fallback para ETH transfers
  }
}
