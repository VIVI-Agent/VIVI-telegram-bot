import { Address } from "viem";

// Token aliases configuration
export const TOKEN_ALIASES: Record<string, Address> = {
  // Single word aliases that resolve to specific addresses
  bife: "0xD769d56f479E9E72a77bB1523e866A33098Feec5" as Address, // Replace with actual BIFE address
  // Note: ETH is handled specially as native ETH, not WETH
};

// Multi-word token aliases
export const MULTI_WORD_ALIASES: Record<string, Address> = {
  "baby sato": "0x25FBfff98D07Fe586eA91953A5106e612c8B9e03" as Address, // Replace with actual address
};

// Connector words to ignore in parsing
export const CONNECTOR_WORDS = [
  "of",
  "from",
  "to",
  "for",
  "->",
  "→",
  "at",
  "into",
  "and",
];

/**
 * Find multi-word tokens in the word array
 */
export function findMultiWordToken(
  words: string[]
): { token: string; address: Address; wordCount: number } | null {
  // Check 2-word combinations first, then 3-word, etc.
  for (let wordCount = 3; wordCount >= 2; wordCount--) {
    if (words.length >= wordCount) {
      const tokenCandidate = words.slice(0, wordCount).join(" ").toLowerCase();
      const address = MULTI_WORD_ALIASES[tokenCandidate];
      if (address) {
        return {
          token: tokenCandidate,
          address,
          wordCount,
        };
      }
    }
  }
  return null;
}
