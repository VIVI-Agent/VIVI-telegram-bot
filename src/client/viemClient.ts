// src/services/viemClient.ts
import { createPublicClient, createWalletClient, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  baseChainDRPC,
  baseChainOficial,
  baseChainQuickNode,
} from "./baseChain";

// Cliente público para QuickNode (operaciones críticas)
export const publicClientBaseOficial = createPublicClient({
  chain: baseChainOficial,
  transport: http(baseChainOficial.rpcUrls.default.http[0]),
});

// Cliente público para QuickNode (operaciones críticas)
export const publicClientQuickNode = createPublicClient({
  chain: baseChainQuickNode,
  transport: http(baseChainQuickNode.rpcUrls.default.http[0]),
});

// Cliente público para DRPC (operaciones de refresh y data)
export const publicClientDRPC = createPublicClient({
  chain: baseChainDRPC,
  transport: http(baseChainDRPC.rpcUrls.default.http[0]),
});

// URL del explorador de bloques (QuickNode)
export const explorerUrl =
  publicClientQuickNode.chain.blockExplorers.default.url;

// Cliente privado para QuickNode (operaciones críticas)
export function getUserWalletClientQuickNode(userPrivateKey: Hex) {
  return createWalletClient({
    chain: baseChainQuickNode,
    transport: http(baseChainQuickNode.rpcUrls.default.http[0]),
    account: privateKeyToAccount(userPrivateKey),
  });
}

// Cliente privado para DRPC (si es necesario en el futuro)
export function getUserWalletClientDRPC(userPrivateKey: Hex) {
  return createWalletClient({
    chain: baseChainDRPC,
    transport: http(baseChainDRPC.rpcUrls.default.http[0]),
    account: privateKeyToAccount(userPrivateKey),
  });
}

export function extractUserFriendlyError(err: any): string {
  if (!err) return "Sorry kiddo, Unknown error";

  const msg = err.message?.toLowerCase() || "";

  if (/insufficient funds|exceeds.*balance/i.test(msg)) {
    return "Sorry kiddo, gotta load up more eth to perfom txs";
  } else if (/nonce too high|is hig/i.test(msg)) {
    return "Sorry kiddo, Nonce too high";
  } else if (/nonce too low|already imported|is lower/i.test(msg)) {
    return "Sorry kiddo, Nonce too low";
  } else if (/fee cap .* high/i.test(msg)) {
    return "Sorry kiddo, Fee cap too high";
  } else if (/fee cap .* low/i.test(msg)) {
    return "Sorry kiddo, Fee cap too low";
  } else if (/intrinsic gas.*high/i.test(msg)) {
    return "Sorry kiddo, Gas limit high";
  } else if (/intrinsic gas.*low/i.test(msg)) {
    return "Sorry kiddo, Gas limit low";
  } else if (/execution reverted/i.test(msg)) {
    return "Sorry kiddo, Execution reverted";
  } else if (/transaction type.*not.*supported|invalid/i.test(msg)) {
    return "Sorry kiddo, Tx type not supported";
  } else if (/tip.*higher.*fee cap/i.test(msg)) {
    return "Sorry kiddo, Tip above fee cap";
  } else if (/network error|fetch|failed to fetch/i.test(msg)) {
    return "Sorry kiddo, Network error";
  } else if (/replacement transaction underpriced/i.test(msg)) {
    return "Sorry kiddo, replacement tx underpriced";
  } else if (/Timeout/i.test(msg)) {
    return "Sorry kiddo, tx is taking too long by network delay";
  } else {
    return "Sorry kiddo, error in the tx";
  }
}
