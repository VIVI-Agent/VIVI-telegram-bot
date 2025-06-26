import { formatEther } from "viem";

export function formatEthBalance(balanceWei: bigint | string): string {
  try {
    const balBN =
      typeof balanceWei === "string" ? BigInt(balanceWei) : balanceWei;
    const ethString = formatEther(balBN);
    return parseFloat(ethString).toFixed(4);
  } catch (error) {
    // Fallback to "0.0000" if there's any error (invalid input, etc.)
    return "0.0000";
  }
}

export function formatEthBalanceWithSymbol(
  balanceWei: bigint | string
): string {
  return `${formatEthBalance(balanceWei)} Ξ`;
}
