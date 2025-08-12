// src/blockchain/services/swap/v4/contractService.ts
import { Address, Hex, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { VIVIUniswapV4ABI } from "@abis";
import { logger } from "@logger";
import { FeeReceiver, TradeResult, V4BuyParams, V4SellParams } from "../types";

export async function executeBuyV4(params: V4BuyParams): Promise<TradeResult> {
  const {
    contractAddress,
    privateKey,
    poolKey,
    ethAmount,
    minAmountOut,
    feeBps,
    additionalFeeReceivers = [],
    gasLimit = 800_000n,
  } = params;

  try {
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    logger.info(`[V4:Contract] BUY ${ethAmount} ETH → tokens`);
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: VIVIUniswapV4ABI,
      functionName: "VIVIBuy",
      args: [
        {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        minAmountOut,
        feeBps,
        additionalFeeReceivers.map((r) => ({ receiver: r.receiver, bps: r.bps })),
      ],
      value: ethAmount,
      gas: gasLimit,
    });

    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      return { hash, success: true, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed };
    }
    return { hash, success: false, error: "Transaction reverted" };
  } catch (error: any) {
    logger.error(`[V4:Contract] BUY error: ${error.message}`);
    return { hash: "0x0" as `0x${string}`, success: false, error: error.message };
  }
}

export async function executeSellV4(params: V4SellParams): Promise<TradeResult> {
  const {
    contractAddress,
    privateKey,
    poolKey,
    tokenAmount,
    minAmountOut,
    feeBps,
    additionalFeeReceivers = [],
    gasLimit = 900_000n,
  } = params;

  try {
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    logger.info(`[V4:Contract] SELL ${tokenAmount} tokens → ETH`);
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: VIVIUniswapV4ABI,
      functionName: "VIVISell",
      args: [
        {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        tokenAmount,
        minAmountOut,
        feeBps,
        additionalFeeReceivers.map((r) => ({ receiver: r.receiver, bps: r.bps })),
      ],
      gas: gasLimit,
    });

    const receipt = await walletClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") {
      return { hash, success: true, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed };
    }
    return { hash, success: false, error: "Transaction reverted" };
  } catch (error: any) {
    logger.error(`[V4:Contract] SELL error: ${error.message}`);
    return { hash: "0x0" as `0x${string}`, success: false, error: error.message };
  }
}

export async function executePermit2ApproveV4(
  contractAddress: Address,
  tokenAddress: Address,
  privateKey: Hex,
  amount?: bigint,
  expiration?: number
): Promise<TradeResult> {
  try {
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    const defaultAmount = 2n ** 160n - 1n;
    const defaultExpiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const approveAmount = amount || defaultAmount;
    const approveExpiration = expiration || defaultExpiration;

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: VIVIUniswapV4ABI,
      functionName: "approveTokenPermit2",
      args: [tokenAddress, approveAmount, approveExpiration],
      gas: 200_000n,
    });

    const receipt = await walletClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") {
      return { hash, success: true, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed };
    }
    return { hash, success: false, error: "Transaction reverted" };
  } catch (error: any) {
    logger.error(`[V4:Contract] Permit2 Approve error: ${error.message}`);
    return { hash: "0x0" as `0x${string}`, success: false, error: error.message };
  }
}

