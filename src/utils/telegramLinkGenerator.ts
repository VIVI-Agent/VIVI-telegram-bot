import { Address } from "viem";
import { secrets } from "@config";

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
 * Generate both buy and sell links for a token
 *
 * @param tokenAddress - The contract address of the token
 * @returns Object containing both buy and sell links with start parameters
 *
 * @example
 * ```typescript
 * const links = generateBothTradeLinks("0x06e3685982b381ab7ecb760c8fbd7d92ac368a27");
 * console.log(links.buyLink);  // Buy link
 * console.log(links.sellLink); // Sell link
 * ```
 */
export function generateBothTradeLinks(tokenAddress: Address): TradeLinkResult {
  // Validate token address
  if (
    !tokenAddress ||
    !tokenAddress.startsWith("0x") ||
    tokenAddress.length !== 42
  ) {
    throw new Error(`Invalid token address format: ${tokenAddress}`);
  }

  const normalizedAddress = tokenAddress.toLowerCase();

  // Generate start parameters
  const buyStartParam = `trade_buy_${normalizedAddress}`;
  const sellStartParam = `trade_sell_${normalizedAddress}`;

  // Generate complete links
  const buyLink = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=${buyStartParam}`;
  const sellLink = `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=${sellStartParam}`;

  return {
    buyLink,
    sellLink,
    buyStartParam,
    sellStartParam,
  };
}

/**
 * Generate markdown formatted trading links for easy sharing
 *
 * @param tokenAddress - The contract address of the token
 * @param tokenSymbol - Optional token symbol for better readability
 * @returns Markdown formatted string with both buy and sell links
 *
 * @example
 * ```typescript
 * const markdown = generateTradeLinkMarkdown(
 *   "0x06e3685982b381ab7ecb760c8fbd7d92ac368a27",
 *   "TOKEN"
 * );
 * // Returns formatted markdown with buy/sell links
 * ```
 */
export function generateTradeLinkMarkdown(
  tokenAddress: Address,
  tokenSymbol?: string
): string {
  const links = generateBothTradeLinks(tokenAddress);
  const symbol = tokenSymbol ? ` ${tokenSymbol}` : "";

  return (
    `🔗 **Trading Links${symbol}**\n\n` +
    `🟢 [Buy${symbol}](${links.buyLink})\n` +
    `🔴 [Sell${symbol}](${links.sellLink})\n\n` +
    `📝 Token: \`${tokenAddress}\``
  );
}

/**
 * Parse start parameter back to trade info
 *
 * @param startParam - The start parameter from Telegram link
 * @returns Parsed trade information or null if invalid
 *
 * @example
 * ```typescript
 * const info = parseTradeStartParam("trade_buy_0x06e3685982b381ab7ecb760c8fbd7d92ac368a27");
 * // Returns: { action: "trade", mode: "buy", tokenAddress: "0x06e3685982b381ab7ecb760c8fbd7d92ac368a27" }
 * ```
 */
export function parseTradeStartParam(startParam: string): {
  action: string;
  mode: TradeMode;
  tokenAddress: Address;
} | null {
  if (!startParam) return null;

  const parts = startParam.split("_");
  if (parts.length !== 3) return null;

  const [action, mode, tokenAddress] = parts;

  // Validate action
  if (action !== "trade") return null;

  // Validate mode
  if (!["buy", "sell"].includes(mode)) return null;

  // Validate token address
  if (
    !tokenAddress ||
    !tokenAddress.startsWith("0x") ||
    tokenAddress.length !== 42
  ) {
    return null;
  }

  return {
    action,
    mode: mode as TradeMode,
    tokenAddress: tokenAddress as Address,
  };
}

/**
 * Generate a shareable message with trading links
 *
 * @param tokenAddress - The contract address of the token
 * @param tokenSymbol - Token symbol
 * @param tokenName - Optional full token name
 * @returns Formatted message for sharing
 *
 * @example
 * ```typescript
 * const message = generateShareableTradeMessage(
 *   "0x06e3685982b381ab7ecb760c8fbd7d92ac368a27",
 *   "BARIO",
 *   "Bario Token"
 * );
 * ```
 */
export function generateShareableTradeMessage(
  tokenAddress: Address,
  tokenSymbol: string,
  tokenName?: string
): string {
  const links = generateBothTradeLinks(tokenAddress);
  const fullName = tokenName ? ` (${tokenName})` : "";

  return (
    `🚀 **${tokenSymbol}${fullName}** on VIVI\n\n` +
    `💰 Quick Trading:\n` +
    `• [🟢 Buy ${tokenSymbol}](${links.buyLink})\n` +
    `• [🔴 Sell ${tokenSymbol}](${links.sellLink})\n\n` +
    `📊 Token: \`${tokenAddress}\`\n` +
    `🤖 Powered by @VIVIBaseBot`
  );
}
