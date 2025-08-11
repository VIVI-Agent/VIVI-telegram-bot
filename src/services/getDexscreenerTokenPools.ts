import { logger } from "@logger";
import { dexscreenerClient } from "@client";
import { Address } from "viem";

/**
 * Get token pools data from DexScreener API
 * @param chainId - The blockchain network (e.g., "ethereum", "bsc", "polygon", "base")
 * @param tokenAddress - The token contract address
 */
export async function getDexscreenerTokenPools(
  chainId: string,
  tokenAddress: Address
): Promise<any> {
  const logPrefix = "[getDexscreenerTokenPools]";
  
  try {
    logger.info(`${logPrefix} Fetching pools for token ${tokenAddress} on ${chainId}`);

    const response = await dexscreenerClient.get(
      `/token-pairs/v1/${chainId}/${tokenAddress}`
    );

    console.log(`🎯 [DEXSCREENER RESPONSE] Complete response for ${tokenAddress}:`);
    console.log(JSON.stringify(response.data, null, 2));
    
    logger.info(`${logPrefix} Response received for ${tokenAddress} on ${chainId}`);

    return response.data;
  } catch (error: any) {
    logger.error(`${logPrefix} Error fetching pools for ${tokenAddress} on ${chainId}:`, error);
    console.log(`❌ [DEXSCREENER ERROR] Error response:`, error.response?.data || error.message);
    throw error;
  }
}
