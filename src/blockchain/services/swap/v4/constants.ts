// src/blockchain/services/swap/v4/constants.ts

export const STATE_VIEW_ADDRESS = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71"; // Base mainnet
export const V4_QUOTER_ADDRESS = "0x0d5e0f971ed27fbff6c2837bf31316121532048d"; // Base V4Quoter
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// Zora V4 defaults (token launcher)
export const ZORA_V4_HOOK_ADDRESS =
  "0x9ea932730A7787000042e34390B8E435dD839040";
export const ZORA_V4_FEE = 30000;

// Clankr V4 variants
export const CLANKR_STATIC_HOOK_ADDRESS =
  "0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC";
export const CLANKR_DYNAMIC_HOOK_ADDRESS =
  "0x34a45c6B61876d739400Bd71228CbcbD4F53E8cC";
export const CLANKR_V4_FEE = 8388608;

export const TICK_SPACING = 200;

export interface V4PoolVariant {
  name: "ZoraV4" | "ClankrStatic" | "ClankrDynamic";
  hook: string;
  fee: number;
}

export const V4_POOL_VARIANTS: V4PoolVariant[] = [
  { name: "ZoraV4", hook: ZORA_V4_HOOK_ADDRESS, fee: ZORA_V4_FEE },
  {
    name: "ClankrStatic",
    hook: CLANKR_STATIC_HOOK_ADDRESS,
    fee: CLANKR_V4_FEE,
  },
  {
    name: "ClankrDynamic",
    hook: CLANKR_DYNAMIC_HOOK_ADDRESS,
    fee: CLANKR_V4_FEE,
  },
];
