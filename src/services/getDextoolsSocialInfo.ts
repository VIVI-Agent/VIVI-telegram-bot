// api/token/getToken.ts
import { logger } from "@logger";
import { apiClient } from "@client";

export interface TokenDescription {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  socialInfo?: Record<string, any>;
  creationTime?: string;
  creationBlock?: number;
}

export async function getTokenSocialInfo(
  chain: string,
  address: string
): Promise<TokenDescription | undefined> {
  try {
    const url = `/v2/token/${chain}/${address}`;
    const response = await apiClient.get(url);
    logger.info("[getToken]", response.data.data);
    return response.data.data || undefined;
  } catch (error) {
    logger.error("[getToken]", error);
    return undefined;
  }
}
