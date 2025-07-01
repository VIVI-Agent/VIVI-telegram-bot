// src/services/swap/helpers.ts
import type { WriteContractRequest } from "./types";
import {
  getUserWalletClientQuickNode,
  extractUserFriendlyError,
} from "@client";

/**
 * Ejecuta walletClient.writeContract con reintentos y maneja errores
 */
export async function writeContractWithRetries({
  walletClient,
  request,
  maxRetries = 3,
}: {
  walletClient: ReturnType<typeof getUserWalletClientQuickNode>;
  request: WriteContractRequest;
  maxRetries?: number;
}): Promise<{ txHash: `0x${string}` }> {
  let attempts = 0;
  let lastError: any = null;

  while (attempts < maxRetries) {
    attempts++;
    try {
      const txHash = await walletClient.writeContract(request);
      return { txHash };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(extractUserFriendlyError(lastError));
}
