import { Address, createPublicClient } from "viem";
import { contracts } from "@config";
import { logger } from "@logger";

const uniswapV3FactoryAbi = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
] as const;

export interface UniswapV3PoolResult {
  poolAddress: string | null;
  exists: boolean;
  feeTier: number;
}

/**
 * Obtiene la dirección del pool de UniswapV3 para un par de tokens con un fee tier específico
 */
export async function getUniswapV3Pool(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenA: Address,
  tokenB: Address,
  feeTier: number
): Promise<UniswapV3PoolResult> {
  try {
    const poolAddress = await publicClient.readContract({
      address: contracts.UNISWAP_V3_FACTORY_ADDRESS as Address,
      abi: uniswapV3FactoryAbi,
      functionName: "getPool",
      args: [tokenA, tokenB, feeTier],
    });

    const exists = poolAddress !== "0x0000000000000000000000000000000000000000";

    if (exists) {
      logger.info(
        `UniswapV3 Pool found: ${poolAddress} for ${tokenA}/${tokenB} with fee ${feeTier}`
      );
    } else {
      logger.info(
        `UniswapV3 Pool not found for ${tokenA}/${tokenB} with fee ${feeTier}`
      );
    }

    return {
      poolAddress: exists ? (poolAddress as string) : null,
      exists,
      feeTier,
    };
  } catch (error) {
    logger.error(
      `Error getting UniswapV3 pool for ${tokenA}/${tokenB} with fee ${feeTier}:`,
      error
    );
    return {
      poolAddress: null,
      exists: false,
      feeTier,
    };
  }
}

/**
 * Obtiene la mejor dirección de pool de UniswapV3 probando múltiples fee tiers
 */
export async function getBestUniswapV3Pool(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenA: Address,
  tokenB: Address,
  feeTiers: number[] = [500, 3000, 10000]
): Promise<UniswapV3PoolResult[]> {
  const results = await Promise.all(
    feeTiers.map((feeTier) =>
      getUniswapV3Pool(publicClient, tokenA, tokenB, feeTier)
    )
  );

  return results.filter((result) => result.exists);
}
