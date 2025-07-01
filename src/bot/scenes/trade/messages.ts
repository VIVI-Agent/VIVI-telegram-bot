import { DexQuoteResultBuy, DexQuoteResultSell } from "@blockchain";
import { WalletWithHoldings } from "@domain";
import { Token, Wallet } from "@prisma/client";
import { formatEthBalanceWithSymbol } from "@utils";

export const TRADE_TEXTS = {
  BUTTONS: {
    BUY_TOKEN: "💚 Buy Token",
    SELL_TOKEN: "❤️ Sell Token",
  },

  ERRORS: {
    TOKEN_NOT_FOUND: "That doesn't look like a valid token address",
  },

  FUNCTIONS: {
    getCustomAmountMessage: () => `💰 X Ξ\nEnter the amount to buy:`,
    getCustomSlippageMessage: () => `Slippage\n🛴 Enter the slippage amount:`,
    getInvalidTokenMessage: () =>
      `That doesn't look like a valid token address. Please try again.`,
    getWaitingTokenMessage: () => `Enter the contract address you want to buy.`,
    getTradeMessage: (
      token: Token,
      bestDex: DexQuoteResultBuy | DexQuoteResultSell,
      wallets: Wallet[],
      buyAmount: string
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
        dexName += `${emoji} ${bestDex.dexName} ${feeTier}\n`;
      }
      // Format wallet balances
      const walletBalances = wallets
        .map((wallet, index) => {
          const balance = wallet.balance || "0.000001"; // Default fallback
          return `<b>W${index + 1}:</b> ${formatEthBalanceWithSymbol(balance)}`;
        })
        .join(" | ");

      return `<b>${tokenSymbol}</b> <a href="https://basescan.org/token/${tokenAddress}">🔗BASE</a>
<code>${tokenAddress}</code>

<b>Swap Info:</b>
💸 <b>Buy:</b> ${buyAmount} Ξ
💰 <b>Out:</b> ${outputAmount} ${tokenSymbol}
${dexName}

${walletBalances}`;
    },
  },
} as const;
