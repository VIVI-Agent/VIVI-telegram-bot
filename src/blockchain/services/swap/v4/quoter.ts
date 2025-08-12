// src/blockchain/services/swap/v4/quoter.ts
import { Address, createPublicClient, formatUnits } from "viem";
import { V4_QUOTER_ADDRESS, V4_POOL_VARIANTS } from "./constants";
import { logger } from "@logger";
import { PoolKey, V4PoolInfo, V4QuoteResult } from "../types";
import { calculatePoolId, generateVariantPoolKey } from "./poolKey";
import { checkPoolExists } from "./stateView";

export const V4_QUOTER_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

async function getV4Quote(
  publicClient: ReturnType<typeof createPublicClient>,
  poolKey: PoolKey,
  zeroForOne: boolean,
  exactAmount: bigint
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const quoteParams = {
      poolKey: {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      zeroForOne,
      exactAmount,
      hookData: "0x" as `0x${string}`,
    };

    const result = await publicClient.simulateContract({
      address: V4_QUOTER_ADDRESS as Address,
      abi: V4_QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [quoteParams],
    });

    const [amountOut, gasEstimate] = result.result;
    return { amountOut, gasEstimate };
  } catch (error) {
    logger.error(`Error getting V4 quote: ${error}`);
    return null;
  }
}

export async function findV4Pools(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address
): Promise<V4PoolInfo[]> {
  const variants = V4_POOL_VARIANTS;
  const poolInfos: V4PoolInfo[] = [];

  for (const variant of variants) {
    const { poolKey, isTokenCurrency0 } = generateVariantPoolKey(
      tokenAddress,
      variant
    );
    const poolId = calculatePoolId(poolKey);
    const exists = await checkPoolExists(publicClient, poolId);

    if (exists) {
      poolInfos.push({ poolKey, poolId, exists: true, isTokenCurrency0 });
      logger.info(
        `[V4:Quoter] Pool found (${variant.name}): ${poolId} (${poolKey.currency0} / ${poolKey.currency1})`
      );
    } else {
      logger.info(`[V4:Quoter] Pool not found (${variant.name}): ${poolId}`);
    }
  }

  return poolInfos;
}

export async function getV4QuoteBuy(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address,
  amountEthIn: bigint,
  decimalsOut: number
): Promise<V4QuoteResult | null> {
  try {
    const pools = await findV4Pools(publicClient, tokenAddress);

    if (pools.length === 0) {
      logger.warn(`No V4 pools found for token ${tokenAddress}`);
      return null;
    }

    let best: V4QuoteResult | null = null;
    for (const pool of pools) {
      const zeroForOne = !pool.isTokenCurrency0;
      const quote = await getV4Quote(
        publicClient,
        pool.poolKey,
        zeroForOne,
        amountEthIn
      );
      if (!quote) continue;
      const candidate: V4QuoteResult = {
        dexName: "UniswapV4",
        amountOut: quote.amountOut.toString(),
        formattedOut: formatUnits(quote.amountOut, decimalsOut),
        feeTier: pool.poolKey.fee,
        poolKey: pool.poolKey,
        poolId: pool.poolId,
        gasEstimate: quote.gasEstimate.toString(),
      };
      if (!best || BigInt(candidate.amountOut) > BigInt(best.amountOut)) {
        best = candidate;
      }
    }

    if (!best) {
      logger.warn(`Failed to get V4 buy quote for token ${tokenAddress}`);
      return null;
    }

    logger.info(
      `V4 BUY best quote: ${best.formattedOut} tokens for ${formatUnits(
        amountEthIn,
        18
      )} ETH`
    );
    return best;
  } catch (error) {
    logger.error(`Error getting V4 buy quote: ${error}`);
    return null;
  }
}

export async function getV4QuoteSell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address,
  amountTokenIn: bigint,
  decimalsIn: number = 18,
  decimalsOut: number = 18
): Promise<V4QuoteResult | null> {
  try {
    const pools = await findV4Pools(publicClient, tokenAddress);

    if (pools.length === 0) {
      logger.warn(`No V4 pools found for token ${tokenAddress}`);
      return null;
    }

    let best: V4QuoteResult | null = null;
    for (const pool of pools) {
      try {
        const zeroForOne = pool.isTokenCurrency0;
        const quote = await getV4Quote(
          publicClient,
          pool.poolKey,
          zeroForOne,
          amountTokenIn
        );
        if (!quote) continue;
        const candidate: V4QuoteResult = {
          dexName: "UniswapV4",
          amountOut: quote.amountOut.toString(),
          formattedOut: formatUnits(quote.amountOut, decimalsOut),
          feeTier: pool.poolKey.fee,
          poolKey: pool.poolKey,
          poolId: pool.poolId,
          gasEstimate: quote.gasEstimate.toString(),
        };
        if (!best || BigInt(candidate.amountOut) > BigInt(best.amountOut)) {
          best = candidate;
        }
      } catch {
        continue;
      }
    }

    if (!best) {
      logger.warn(`No valid V4 sell quote found for token ${tokenAddress}`);
      return null;
    }

    logger.info(
      `V4 SELL best quote: ${best.formattedOut} ETH for ${formatUnits(
        amountTokenIn,
        decimalsIn
      )} tokens`
    );
    return best;
  } catch (error) {
    logger.error(`Error getting V4 sell quote: ${error}`);
    return null;
  }
}
