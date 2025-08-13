import {
  DexQuoteResultBuy,
  DexQuoteResultSell,
  TokenInfoSummary,
} from "@blockchain";
import { Token, Wallet, Holding } from "@prisma/client";
import { formatEthBalanceWithSymbol } from "@utils";
import { formatUnits } from "viem";
import { logger } from "@logger";

// Type for wallets as they appear in TradeSceneData
type TradeWallet = Wallet & {
  holdings: (Holding & { token: Token }) | null;
};

export const TRADE_TEXTS = {
  BUTTONS: {
    BUY_TOKEN: "⚡ BUY",
    SELL_TOKEN: "⚡ SELL",
  },

  ERRORS: {
    TOKEN_NOT_FOUND: "That doesn't look like a valid token address",
    NO_POOL: "No pool found for this token",
    INSUFFICIENT_BALANCE: "❌ Insufficient balance in wallet",
    NO_TOKENS_TO_SELL: "❌ No tokens to sell in wallet",
    TRANSACTION_FAILED: "❌ Transaction failed",
    BUY_FAILED: "❌ Buy failed",
    SELL_FAILED: "❌ Sell failed",
  },

  FUNCTIONS: {
    getCustomAmountMessage: () => `💰 X Ξ\nEnter the amount to buy:`,
    getCustomPercentageMessage: () =>
      `💰 X%\nEnter the percentage to sell (1-100):`,
    getCustomSlippageMessage: () => `Slippage\n🛴 Enter the slippage amount:`,
    getInvalidTokenMessage: () =>
      `That doesn't look like a valid token address. Please try again.`,
    getWaitingTokenMessage: () => `Enter the contract address you want to buy.`,
    getTradeMessage: (
      token: Token,
      bestDex: DexQuoteResultBuy | DexQuoteResultSell,
      wallets: TradeWallet[],
      amount: string,
      isSell?: boolean,
      tokenInfo?: TokenInfoSummary | null,
      totalHoldings?: string,
      dexscreenerLiquidityUsd?: number
    ) => {
      const tokenSymbol = token.symbol;
      const tokenAddress = token.address;

      // Format the output amount with thousand separators (commas) and 4 decimals
      const rawAmount = parseFloat(bestDex.formattedOut);
      const outputAmount = rawAmount.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
      let dexName = ""; // This should come from bestDex
      const feeTier = bestDex?.feeTier ? `| ${bestDex.feeTier / 10000}%` : "";
      // Pool info
      if (bestDex.dexName === "ZoraMultiHop") {
        dexName += `🦄 ZoraToken | 1%\n`;
      } else if (bestDex.dexName === "ApeStore") {
        dexName += `🍌 ApeStore | 1%\n`;
      } else if (bestDex.dexName === "VirtualToken") {
        dexName += `🦄 VirtualToken ${feeTier}\n`;
      } else {
        const emoji = bestDex.dexName.includes("Uniswap") ? "🦄" : "✈️";
        dexName += `${emoji} ${bestDex.dexName} ${
          feeTier === "838.8608%" ? "ClankerV4" : feeTier
        }\n`;
      }
      // Format wallet balances in chunks of 3 wallets per line
      const chunkSize = 3;
      const walletChunks: TradeWallet[][] = [];
      for (let i = 0; i < wallets.length; i += chunkSize) {
        walletChunks.push(wallets.slice(i, i + chunkSize));
      }

      // Create ETH balance lines (3 wallets per line)
      const ethBalanceLines = walletChunks.map((chunk, chunkIndex) =>
        chunk
          .map((wallet, index) => {
            const globalIndex = chunkIndex * chunkSize + index;
            const ethBalance = wallet.balance || "0.000001"; // Default fallback

            // Check if balance is 0 to format without decimals
            const balanceNum = BigInt(ethBalance);
            const isZeroBalance = balanceNum === 0n;
            const decimals = isZeroBalance ? 0 : 4;

            const ethFormatted = formatEthBalanceWithSymbol(
              ethBalance,
              decimals
            ).replace(" ETH", " Ξ");
            return `<b>W${globalIndex + 1}:</b> ${ethFormatted}`;
          })
          .join(" | ")
      );

      // Create token balance lines (3 wallets per line)
      const tokenBalanceLines = walletChunks.map((chunk, chunkIndex) =>
        chunk
          .map((wallet, index) => {
            const globalIndex = chunkIndex * chunkSize + index;
            // Check if wallet has holding for this specific token (holdings is a single object, not array)
            const tokenHolding =
              wallet.holdings?.tokenId === token.id ? wallet.holdings : null;
            let tokenFormatted = "";

            if (
              tokenHolding &&
              tokenHolding.balance &&
              BigInt(tokenHolding.balance) > 0n
            ) {
              const tokenBalance = formatUnits(
                BigInt(tokenHolding.balance),
                token.decimals
              );
              const tokenAmount = parseFloat(tokenBalance);

              // Format with appropriate precision
              if (tokenAmount >= 1000000) {
                tokenFormatted = `${(tokenAmount / 1000000).toFixed(2)}M`;
              } else if (tokenAmount >= 1000) {
                tokenFormatted = `${(tokenAmount / 1000).toFixed(2)}K`;
              } else if (tokenAmount >= 1) {
                tokenFormatted = `${tokenAmount.toFixed(2)}`;
              } else {
                tokenFormatted = `${tokenAmount.toFixed(6)}`;
              }
            } else {
              tokenFormatted = `0`; // No decimals for zero balance
            }

            return `<b>W${globalIndex + 1}:</b> ${tokenFormatted}`;
          })
          .join(" | ")
      );

      const walletBalances = `<b>${tokenSymbol}:</b> ${totalHoldings}
${tokenBalanceLines.join("\n")}\n
${ethBalanceLines.join("\n")}`;
      // Different message format for buy vs sell
      const amountLabel = isSell ? "💸 <b>Sell:</b> " : "💸 <b>Buy:</b> ";
      const amountSuffix = isSell ? "%" : " Ξ";
      const outputLabel = isSell ? "💰 <b>Out:</b> " : "💰 <b>Out:</b> ";
      const outputValue = isSell
        ? `${outputAmount} ETH`
        : `${outputAmount} ${tokenSymbol} \n`;

      // Token info section (always show liquidity info)
      logger.info(
        `[TradeMessages] Liquidity param received: ${dexscreenerLiquidityUsd}`
      );
      let tokenInfoSection = "";
      const hasLiquidity = typeof dexscreenerLiquidityUsd === "number";
      const isApeStore = bestDex.dexName === "ApeStore";
      logger.info(
        `[TradeMessages] hasLiquidity: ${hasLiquidity}, isApeStore: ${isApeStore}`
      );

      const marketCap = tokenInfo
        ? formatMarketCap(tokenInfo.marketCap)
        : undefined;

      const lines: string[] = [];

      // Always show liquidity line with appropriate message
      if (hasLiquidity) {
        const liquidityFormatted = dexscreenerLiquidityUsd!.toLocaleString(
          "en-US",
          {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }
        );

        // Add warning for low liquidity pools with different severity levels
        let liquidityLine = `💧 <b>Liquidity:</b> $${liquidityFormatted}`;

        if (dexscreenerLiquidityUsd! < 1000) {
          liquidityLine += ` 🚨 <i>Low Liquidity (&lt;1K USD)</i>`;
        } else if (dexscreenerLiquidityUsd! < 5000) {
          liquidityLine += ` ⚠️ <i>Low Liquidity (&lt;5K USD)</i>`;
        } else if (dexscreenerLiquidityUsd! < 10000) {
          liquidityLine += ` 💡 <i>Low Liquidity (&lt;10K USD)</i>`;
        }

        lines.push(liquidityLine);
      } else if (isApeStore) {
        // Special case for ApeStore
        const liquidityLine = `💧 <b>Liquidity:</b> <a href="https://ape.store/base/${tokenAddress}">Check ApeStore 🍌</a> `;
        lines.push(liquidityLine);
      } else {
        // Unknown liquidity case
        const liquidityLine = `💧 <b>Liquidity:</b> 💡 <i>Not available yet - token may be recently deployed</i>`;
        lines.push(liquidityLine);
      }

      if (marketCap) lines.push(`📊 <b>MarketCap:</b> ${marketCap}`);

      tokenInfoSection = `${lines.join("\n")}\n`;
      logger.info(
        `[TradeMessages] TokenInfoSection built. Includes liquidity: true`
      );

      // Social links section
      const socialLinks = buildSocialLinks(tokenAddress, bestDex.dexName);

      return `<b>${tokenSymbol}</b> <a href="https://basescan.org/token/${tokenAddress}">🔗BASE</a>
<code>${tokenAddress}</code>

${dexName}${tokenInfoSection}
<b>Swap Info:</b>
${amountLabel}${amount}${amountSuffix}
${outputLabel}${outputValue}
${walletBalances}

ℹ️ Press refresh to monitor
${socialLinks}`;
    },
  },
} as const;

/**
 * Build social links string for token info
 */
export function buildSocialLinks(
  address: string,
  bestDexName?: string
): string {
  const defaultLinks = [
    `<a href="https://basescan.org/token/${address}">BScan</a>`,
    `<a href="https://www.geckoterminal.com/base/pools/${address}">CG</a>`,
    `<a href="https://dexscreener.com/base/${address}">DexSc</a>`,
    `<a href="https://www.dextools.io/app/en/base/pair-explorer/${address}">DexT</a>`,
    `<a href="https://www.defined.fi/base/${address}">Def</a>`,
  ];

  // Add Apestore link if bestDexName is "ApeStore"
  if (bestDexName === "ApeStore") {
    defaultLinks.push(`<a href="https://ape.store/base/${address}">Ape</a>`);
  }

  return defaultLinks.join(" | ");
}

/**
 * Format market cap with US number formatting (commas and dots)
 */
export function formatMarketCap(marketCap?: string): string {
  if (!marketCap) return "N/A";

  const value = parseFloat(marketCap);
  if (isNaN(value)) return "N/A";

  // Format with US locale (commas for thousands, dots for decimals)
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Format holders count
 */
export function formatHolders(holders?: string): string {
  if (!holders) return "N/A";

  const value = parseFloat(holders);
  if (isNaN(value)) return "N/A";

  return Math.floor(value).toLocaleString();
}

/**
 * Format total holdings with natural abbreviations (K, M, B, T)
 */
export function formatTotalHoldings(totalHoldings?: string): string {
  if (!totalHoldings) return "0";

  const value = parseFloat(totalHoldings);
  if (isNaN(value)) return "0";

  if (value >= 1000000000000) {
    return `${(value / 1000000000000).toFixed(2)}T`;
  } else if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(2)}B`;
  } else if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  } else if (value >= 1) {
    return `${value.toFixed(2)}`;
  } else {
    return `${value.toFixed(6)}`;
  }
}
