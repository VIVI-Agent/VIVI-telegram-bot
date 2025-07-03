import { Address, createPublicClient } from "viem";
import { contracts } from "@config";
import { logger } from "@logger";

const uniswapV2FactoryAbi = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
] as const;

export interface UniswapV2PoolResult {
  poolAddress: string | null;
  exists: boolean;
}

/**
 * Obtiene la dirección del pool de UniswapV2 para un par de tokens
 */
export async function getUniswapV2Pool(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenA: Address,
  tokenB: Address
): Promise<UniswapV2PoolResult> {
  try {
    const poolAddress = await publicClient.readContract({
      address: contracts.UNISWAP_V2_FACTORY_ADDRESS as Address,
      abi: uniswapV2FactoryAbi,
      functionName: "getPair",
      args: [tokenA, tokenB],
    });

    const exists = poolAddress !== "0x0000000000000000000000000000000000000000";

    if (exists) {
      logger.info(
        `UniswapV2 Pool found: ${poolAddress} for ${tokenA}/${tokenB}`
      );
    } else {
      logger.info(`UniswapV2 Pool not found for ${tokenA}/${tokenB}`);
    }

    return {
      poolAddress: exists ? (poolAddress as string) : null,
      exists,
    };
  } catch (error) {
    logger.error(
      `Error getting UniswapV2 pool for ${tokenA}/${tokenB}:`,
      error
    );
    return {
      poolAddress: null,
      exists: false,
    };
  }
}
