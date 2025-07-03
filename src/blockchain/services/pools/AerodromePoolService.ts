import { Address, createPublicClient } from "viem";
import { contracts } from "@config";
import { logger } from "@logger";

const aerodromeFactoryAbi = [
  "function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool)",
] as const;

export interface AerodromePoolResult {
  poolAddress: string | null;
  exists: boolean;
  stable: boolean;
  poolType: "Stable" | "Volatile";
}

/**
 * Obtiene la dirección del pool de Aerodrome para un par de tokens (stable o volatile)
 */
export async function getAerodromePool(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenA: Address,
  tokenB: Address,
  stable: boolean
): Promise<AerodromePoolResult> {
  try {
    const factory = stable
      ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address) // Stable Factory
      : ("0x420dd381b31aef6683db6b902084cb0ffece40da" as Address); // Volatile Factory

    const poolAddress = await publicClient.readContract({
      address: factory,
      abi: aerodromeFactoryAbi,
      functionName: "getPool",
      args: [tokenA, tokenB, stable],
    });

    const exists = poolAddress !== "0x0000000000000000000000000000000000000000";
    const poolType = stable ? "Stable" : "Volatile";

    if (exists) {
      logger.info(
        `Aerodrome ${poolType} Pool found: ${poolAddress} for ${tokenA}/${tokenB}`
      );
    } else {
      logger.info(
        `Aerodrome ${poolType} Pool not found for ${tokenA}/${tokenB}`
      );
    }

    return {
      poolAddress: exists ? (poolAddress as string) : null,
      exists,
      stable,
      poolType,
    };
  } catch (error) {
    const poolType = stable ? "Stable" : "Volatile";
    logger.error(
      `Error getting Aerodrome ${poolType} pool for ${tokenA}/${tokenB}:`,
      error
    );
    return {
      poolAddress: null,
      exists: false,
      stable,
      poolType,
    };
  }
}

/**
 * Obtiene ambos pools de Aerodrome (stable y volatile) para un par de tokens
 */
export async function getBothAerodromePools(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenA: Address,
  tokenB: Address
): Promise<{
  stablePool: AerodromePoolResult;
  volatilePool: AerodromePoolResult;
}> {
  const [stablePool, volatilePool] = await Promise.all([
    getAerodromePool(publicClient, tokenA, tokenB, true),
    getAerodromePool(publicClient, tokenA, tokenB, false),
  ]);

  return {
    stablePool,
    volatilePool,
  };
}
