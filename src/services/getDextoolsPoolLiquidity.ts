// api/token/getTokenFinancialInfo.ts
import { logger } from "@logger";
import { apiClient } from "@client";

export interface PoolLiquidity {
  reserves: {
    mainToken: number;
    sideToken: number;
  };
  liquidity: number;
}

export async function getPoolLiquidity(
  chain: string,
  address: string
): Promise<PoolLiquidity | undefined> {
  try {
    const url = `/v2/pool/${chain}/${address}/liquidity`;
    const response = await apiClient.get(url);
    logger.info(`[getPoolLiquidity] ${address}:`, response.data.data);

    // Add detailed console logs for debugging
    console.log(`🔍 [DEXTOOLS DEBUG] Financial Info for ${address}:`);
    console.log(`  liquidity: ${response.data.data?.liquidity}`);
    console.log(`  reserves: ${response.data.data?.reserves}`);

    return response.data.data || undefined;
  } catch (error) {
    logger.error(`[getPoolLiquidity] Error for ${address}:`, error);
    console.log(
      `🚨 [DEXTOOLS DEBUG] Error getPoolLiquidity info for ${address}:`,
      error
    );
    return undefined;
  }
}
