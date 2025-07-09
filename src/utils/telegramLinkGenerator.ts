import { Address } from "viem";
import { secrets } from "@config";
import { logger } from "@logger";

export type TradeMode = "buy" | "sell";

export interface TradeLinkOptions {
  tokenAddress: Address;
  mode: TradeMode;
}

export interface TradeLinkResult {
  buyLink: string;
  sellLink: string;
  buyStartParam: string;
  sellStartParam: string;
}

/**
 * Generate Telegram deep link for trading a specific token
 *
 * @param tokenAddress - The contract address of the token
 * @param mode - Trading mode: "buy" or "sell"
 * @returns Complete Telegram deep link
 *
 * @example
 * ```typescript
 * const buyLink = generateTradeLink({
 *   tokenAddress: "0x06e3685982b381ab7ecb760c8fbd7d92ac368a27",
 *   mode: "buy"
 * });
 * // Returns: "https://t.me/VIVIBaseBot?start=trade_buy_0x06e3685982b381ab7ecb760c8fbd7d92ac368a27"
 * ```
 */
export function generateTradeLink(options: TradeLinkOptions): string {
  const { tokenAddress, mode } = options;

  // Validate token address format
  if (
    !tokenAddress ||
    !tokenAddress.startsWith("0x") ||
    tokenAddress.length !== 42
  ) {
    throw new Error(`Invalid token address format: ${tokenAddress}`);
  }

  // Validate mode
  if (!["buy", "sell"].includes(mode)) {
    throw new Error(`Invalid trade mode: ${mode}. Must be "buy" or "sell"`);
  }

  // Generate start parameter: trade_{mode}_{tokenAddress}
  const startParam = `trade_${mode}_${tokenAddress.toLowerCase()}`;

  // Generate complete Telegram link
  const telegramLink = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=${startParam}`;

  return telegramLink;
}

/**
 * Generate clickeable token link for buy mode
 */
export function generateClickeableToken(
  tokenSymbol: string,
  tokenAddress?: Address,
  isEthTransfer?: boolean
): string {
  try {
    // For ETH transfers or tokens without address, return plain text
    if (
      isEthTransfer ||
      !tokenAddress ||
      tokenAddress === "0x0000000000000000000000000000000000000000"
    ) {
      return tokenSymbol.toUpperCase();
    }

    const buyLink = generateTradeLink({
      tokenAddress,
      mode: "buy",
    });
    return `<a href="${buyLink}">${tokenSymbol.toUpperCase()}</a>`;
  } catch (error) {
    // Fallback to plain text if link generation fails
    logger.warn(`Failed to generate trade link for ${tokenSymbol}:`, error);
    return tokenSymbol.toUpperCase();
  }
}
