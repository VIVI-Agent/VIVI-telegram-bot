// src/client/baseChain.ts

import { defineChain } from "viem";
import { base, chainEnv } from "@config";

const baseSepoliaConfig = {
  id: 84532,
  name: "Base Sepolia",
  network: "base-sepolia",
  nativeCurrency: {
    name: "Base Sepolia Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorers: {
    default: {
      name: "BaseScan (Sepolia)",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
};

const baseMainnetConfig = {
  id: 8453,
  name: "Base Mainnet",
  network: "base",
  nativeCurrency: {
    name: "Base Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorers: {
    default: {
      name: "BaseScan (Mainnet)",
      url: "https://basescan.org",
    },
  },
  testnet: false,
};

const chosenConfig =
  chainEnv === "sepolia" ? baseSepoliaConfig : baseMainnetConfig;

// Cliente para QuickNode (operaciones críticas como transfer, approve, swap)
export const baseChainQuickNode = defineChain({
  ...chosenConfig,
  rpcUrls: {
    default: {
      http: [base.BASE_RPC_URL],
    },
    public: {
      http: [base.BASE_RPC_URL],
    },
  },
});

// Cliente para DRPC (operaciones de refresh y data)
export const baseChainDRPC = defineChain({
  ...chosenConfig,
  rpcUrls: {
    default: {
      http: [base.BASE_DRPC_URL],
    },
    public: {
      http: [base.BASE_DRPC_URL],
    },
  },
});

// Cliente para DRPC (operaciones de refresh y data)
export const baseChainOficial = defineChain({
  ...chosenConfig,
  rpcUrls: {
    default: {
      http: ["https://mainnet.base.org"],
    },
    public: {
      http: ["https://mainnet.base.org"],
    },
  },
});
