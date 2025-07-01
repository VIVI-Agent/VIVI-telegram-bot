import { formatEther } from "viem";

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
