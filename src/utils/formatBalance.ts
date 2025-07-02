import { formatEther, formatUnits, parseUnits } from "viem";

export function formatEthBalance(
  balanceWei: bigint | string,
  decimals = 4
): string {
  try {
    const balBN =
      typeof balanceWei === "string" ? BigInt(balanceWei) : balanceWei;
    const ethString = formatEther(balBN);
    return parseFloat(ethString).toFixed(decimals);
  } catch (error) {
    // Fallback to "0.0000" if there's any error (invalid input, etc.)
    return "0.0000";
  }
}

export function formatEthBalanceWithSymbol(
  balanceWei: bigint | string,
  decimals = 4
): string {
  return `${formatEthBalance(balanceWei, decimals)} Ξ`;
}

export function formatPoints(points: number): string {
  return points.toFixed(0);
}

export function formatTokenBalance(
  balanceWei: bigint,
  tokenDecimals: number,
  displayDecimals = 4
): string {
  try {
    // Convert bigint to string using token decimals
    const balanceString = formatUnits(balanceWei, tokenDecimals);
    // Convert to number for formatting
    const balanceNumber = parseFloat(balanceString);
    // Return formatted with locale separators
    return balanceNumber.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: displayDecimals,
    });
  } catch (error) {
    return "0";
  }
}

export function formatTokenBalanceWithSymbol(
  balanceWei: bigint,
  tokenDecimals: number,
  symbol: string,
  displayDecimals = 4
): string {
  return `${formatTokenBalance(
    balanceWei,
    tokenDecimals,
    displayDecimals
  )} ${symbol}`;
}
