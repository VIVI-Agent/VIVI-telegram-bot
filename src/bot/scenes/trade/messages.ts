import { DexQuoteResultBuy, DexQuoteResultSell } from "@blockchain";
import { WalletWithHoldings } from "@domain";
import { Token, Wallet, Holding } from "@prisma/client";
import { formatEthBalanceWithSymbol } from "@utils";
import { formatUnits } from "viem";

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
      isSell?: boolean
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
      // Format wallet balances in two separate lines: ETH line and Token line
      const ethBalanceLine = wallets
        .map((wallet, index) => {
          const ethBalance = wallet.balance || "0.000001"; // Default fallback
          const ethFormatted = formatEthBalanceWithSymbol(ethBalance).replace(
            " ETH",
            " Ξ"
          );
          return `<b>W${index + 1}:</b> ${ethFormatted}`;
        })
        .join(" | ");

      const tokenBalanceLine = wallets
        .map((wallet, index) => {
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
              tokenFormatted = `${(tokenAmount / 1000000).toFixed(2)}M ${
                token.symbol
              }`;
            } else if (tokenAmount >= 1000) {
              tokenFormatted = `${(tokenAmount / 1000).toFixed(2)}K ${
                token.symbol
              }`;
            } else if (tokenAmount >= 1) {
              tokenFormatted = `${tokenAmount.toFixed(2)} ${token.symbol}`;
            } else {
              tokenFormatted = `${tokenAmount.toFixed(6)} ${token.symbol}`;
            }
          } else {
            tokenFormatted = `0 ${token.symbol}`;
          }

          return `<b>W${index + 1}:</b> ${tokenFormatted}`;
        })
        .join(" | ");

      const walletBalances = `${ethBalanceLine}\n${tokenBalanceLine}`;

      // Different message format for buy vs sell
      const swapDirection = isSell ? "Sell" : "Buy";
      const amountLabel = isSell ? "💸 <b>Sell:</b> " : "💸 <b>Buy:</b> ";
      const amountSuffix = isSell ? "%" : " Ξ";
      const outputLabel = isSell ? "💰 <b>Get:</b> " : "💰 <b>Out:</b> ";
      const outputValue = isSell
        ? `${outputAmount} ETH`
        : `${outputAmount} ${tokenSymbol}`;

      return `<b>${tokenSymbol}</b> <a href="https://basescan.org/token/${tokenAddress}">🔗BASE</a>
<code>${tokenAddress}</code>

<b>Swap Info:</b>
${amountLabel}${amount}${amountSuffix}
${outputLabel}${outputValue}
${dexName}

${walletBalances}`;
    },
  },
} as const;
