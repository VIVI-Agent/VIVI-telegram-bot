// src/services/swap/helpers.ts
import type { WriteContractRequest } from "./types";
import {
  getUserWalletClientQuickNode,
  extractUserFriendlyError,
} from "@client";
import { PublicClient, TransactionReceipt } from "viem";
import { logger as appLogger } from "@logger";

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

/**
 * Wait for a transaction receipt using primary client's waitForTransactionReceipt.
 * If it doesn't resolve within firstPhaseMs, start manual polling across fallback clients.
 * Returns whichever receipt arrives first.
 */
export async function waitForReceiptWithFallback(params: {
  txHash: `0x${string}`;
  primaryClient: PublicClient;
  fallbackClients?: PublicClient[];
  firstPhaseMs?: number; // default 5000ms
  maxWaitMs?: number; // default 180000ms
  pollIntervalMs?: number; // default 500ms
}): Promise<TransactionReceipt> {
  const {
    txHash,
    primaryClient,
    fallbackClients = [],
    firstPhaseMs = 5000,
    maxWaitMs = 180000,
    pollIntervalMs = 500,
  } = params;

  // Validate tx hash shape early to avoid bad RPC calls like getTransactionByHash("0x0")
  if (typeof txHash !== "string" || txHash.length !== 66) {
    throw new Error(`Invalid tx hash provided: ${txHash}`);
  }

  let primaryResolved = false;
  const primaryPromise = primaryClient
    .waitForTransactionReceipt({ hash: txHash })
    .then((r) => {
      primaryResolved = true;
      return r;
    })
    .catch((err) => {
      // Don't fail immediately; fallback may still find it
      appLogger.debug?.(
        `[waitForReceiptWithFallback] primary waitForTransactionReceipt error: ${
          err?.message || err
        }`
      );
      throw err;
    });

  // Race primary wait with a short timeout
  const raced = await Promise.race<TransactionReceipt | "timeout">([
    primaryPromise,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), firstPhaseMs)
    ),
  ]);

  if (raced !== "timeout") {
    return raced;
  }

  // Start manual polling using fallback clients while primary continues
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (primaryResolved) {
      return await primaryPromise;
    }

    for (const client of [primaryClient, ...fallbackClients]) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash });
        if (receipt) {
          return receipt;
        }
      } catch (err: any) {
        appLogger.debug?.(
          `[waitForReceiptWithFallback] ${
            client?.transport?.name || "client"
          } getTransactionReceipt failed: ${err?.message || err}`
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // If still not found, let primary settle if it can
  try {
    return await primaryPromise;
  } catch (err) {
    throw new Error(
      `Timed out after ${Math.floor(
        maxWaitMs / 1000
      )}s waiting for receipt for ${txHash}`
    );
  }
}
