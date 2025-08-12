// src/services/swap/types.ts
import { Address, Hex, TransactionReceipt } from "viem";
import { GlobalSceneContext } from "@types";
import { Wallet } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Uniswap V4 base types
// ─────────────────────────────────────────────────────────────────────────────

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface V4PoolInfo {
  poolKey: PoolKey;
  poolId: string;
  exists: boolean;
  isTokenCurrency0: boolean;
}

export interface V4RawQuote {
  amountOut: bigint;
  gasEstimate: bigint;
}

export interface V4QuoteResult {
  dexName: string;
  amountOut: string;
  formattedOut: string;
  feeTier: number;
  poolKey: PoolKey;
  poolId: string;
  gasEstimate?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level contract call types (VIVI Uniswap V4)
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeReceiver {
  receiver: Address;
  bps: bigint;
}

export interface V4TradeParams {
  contractAddress: Address;
  privateKey: Hex;
  poolKey: PoolKey;
  minAmountOut: bigint;
  feeBps: bigint;
  additionalFeeReceivers?: FeeReceiver[];
  gasLimit?: bigint;
}

export interface V4BuyParams extends V4TradeParams {
  ethAmount: bigint;
}

export interface V4SellParams extends V4TradeParams {
  tokenAmount: bigint;
}

export interface TradeResult {
  hash: `0x${string}`;
  success: boolean;
  blockNumber?: bigint;
  gasUsed?: bigint;
  error?: string;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Integrated service types (app-level orchestration)
// ─────────────────────────────────────────────────────────────────────────────

export interface V4IntegratedBuyParams {
  ctx: GlobalSceneContext;
  walletEntity: Wallet;
  privateKey: Hex;
  contractAddress: Address;
  tokenAddress: Address;
  ethAmount: bigint;
  feeBps: bigint;
  slippagePercent: number;
  additionalFeeReceivers?: FeeReceiver[];
}

export interface V4IntegratedSellParams {
  ctx: GlobalSceneContext;
  walletEntity: Wallet;
  privateKey: Hex;
  contractAddress: Address;
  tokenAddress: Address;
  tokenAmount: bigint;
  feeBps: bigint;
  slippagePercent: number;
  decimalsIn: number;
  additionalFeeReceivers?: FeeReceiver[];
}

export interface IntegratedTradeResult extends TradeResult {
  quote?: V4QuoteResult;
  actualAmountOut?: string;
  formattedAmountOut?: string;
  priceImpact?: string;
}
