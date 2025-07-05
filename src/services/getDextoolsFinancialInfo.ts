// api/token/getTokenFinancialInfo.ts
import { logger } from "@logger";
import { apiClient } from "@client";

export interface TokenFinancialInfo {
  circulatingSupply?: number;
  totalSupply?: number;
  mcap?: number;
  fdv?: number;
  holders?: number;
  transactions?: number;
}

export async function getTokenFinancialInfo(
  chain: string,
  address: string
): Promise<TokenFinancialInfo | undefined> {
  try {
    const url = `/v2/token/${chain}/${address}/info`;
    const response = await apiClient.get(url);
    logger.info(`[getTokenFinancialInfo] ${address}:`, response.data.data);

    // Add detailed console logs for debugging
    console.log(`🔍 [DEXTOOLS DEBUG] Financial Info for ${address}:`);
    console.log(
      `   📊 Market Cap: ${response.data.data?.mcap} (type: ${typeof response
        .data.data?.mcap})`
    );
    console.log(
      `   👥 Holders: ${response.data.data?.holders} (type: ${typeof response
        .data.data?.holders})`
    );
    console.log(
      `   📜 Total Supply: ${
        response.data.data?.totalSupply
      } (type: ${typeof response.data.data?.totalSupply})`
    );
    console.log(
      `   📜 circulatingSupply: ${
        response.data.data?.circulatingSupply
      } (type: ${typeof response.data.data?.circulatingSupply})`
    );
    console.log(
      `   🔄 Circulating Supply: ${response.data.data?.circulatingSupply}`
    );
    console.log(
      `   💰 FDV: ${response.data.data?.fdv} (type: ${typeof response.data.data
        ?.fdv})`
    );
    console.log(
      `   📈 Transactions: ${
        response.data.data?.transactions
      } (type: ${typeof response.data.data?.transactions})`
    );

    // Log raw response for debugging
    console.log(
      `🔍 [DEXTOOLS RAW] Raw response data:`,
      JSON.stringify(response.data.data, null, 2)
    );

    return response.data.data || undefined;
  } catch (error) {
    logger.error(`[getTokenFinancialInfo] Error for ${address}:`, error);
    console.log(
      `🚨 [DEXTOOLS DEBUG] Error getting financial info for ${address}:`,
      error
    );
    return undefined;
  }
}
