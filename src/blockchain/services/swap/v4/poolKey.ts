// src/blockchain/services/swap/v4/poolKey.ts
import { Address, encodeAbiParameters, keccak256 } from "viem";
import {
  ZORA_V4_FEE,
  ZORA_V4_HOOK_ADDRESS,
  TICK_SPACING,
  WETH_ADDRESS,
  V4PoolVariant,
} from "./constants";
import { PoolKey } from "../types";

export function generateCanonicalPoolKey(
  tokenAddress: Address,
  options?: { fee?: number; hook?: Address }
): { poolKey: PoolKey; isTokenCurrency0: boolean } {
  const weth = WETH_ADDRESS.toLowerCase() as Address;
  const token = tokenAddress.toLowerCase() as Address;

  const tokenIsLower = BigInt(token) < BigInt(weth);

  const poolKey: PoolKey = {
    currency0: tokenIsLower ? token : weth,
    currency1: tokenIsLower ? weth : token,
    fee: options?.fee ?? ZORA_V4_FEE,
    tickSpacing: TICK_SPACING,
    hooks: (options?.hook || ZORA_V4_HOOK_ADDRESS) as Address,
  };

  return { poolKey, isTokenCurrency0: tokenIsLower };
}

export function calculatePoolId(poolKey: PoolKey): string {
  const encoded = encodeAbiParameters(
    [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
    [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
    ]
  );
  return keccak256(encoded);
}

export function generateVariantPoolKey(
  tokenAddress: Address,
  variant: V4PoolVariant
): { poolKey: PoolKey; isTokenCurrency0: boolean } {
  return generateCanonicalPoolKey(tokenAddress, {
    fee: variant.fee,
    hook: variant.hook as Address,
  });
}
