// src/services/swap/types.ts
import { Address, TransactionReceipt } from "viem";

/**
 * Request genérico para writeContractWithRetries
 */
export interface WriteContractRequest {
  address: Address;
  abi: any;
  functionName: string;
  args: unknown[];
  value?: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gas: bigint;
}

/**
 * Resultado común de operaciones de swap
 */
export interface SwapResult {
  txHash: `0x${string}`;
  waitReceipt: Promise<TransactionReceipt>;
}
