// src/abis/wrappers/VIVIUniswapV4ABI.ts

export const VIVIUniswapV4ABI = [
  // Constructor
  {
    inputs: [
      { internalType: "address", name: "_router", type: "address" },
      { internalType: "address", name: "_weth9", type: "address" },
      { internalType: "address", name: "_permit2", type: "address" },
      { internalType: "address", name: "_feeReceiver", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },

  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: false,
        internalType: "address",
        name: "tokenOut",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "ethIn",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "ethInAfterFee",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "tokensOut",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
    ],
    name: "Buy",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: false,
        internalType: "address",
        name: "tokenIn",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "tokensIn",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "ethOut",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "ethOutAfterFee",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
    ],
    name: "Sell",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalFeeAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address[]",
        name: "receivers",
        type: "address[]",
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    name: "FeeDistributed",
    type: "event",
  },

  // Main trading functions
  {
    inputs: [
      {
        components: [
          { internalType: "Currency", name: "currency0", type: "address" },
          { internalType: "Currency", name: "currency1", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "int24", name: "tickSpacing", type: "int24" },
          { internalType: "contract IHooks", name: "hooks", type: "address" },
        ],
        internalType: "struct PoolKey",
        name: "key",
        type: "tuple",
      },
      { internalType: "uint128", name: "minAmountOut", type: "uint128" },
      { internalType: "uint256", name: "feeBps", type: "uint256" },
      {
        components: [
          { internalType: "address", name: "receiver", type: "address" },
          { internalType: "uint256", name: "bps", type: "uint256" },
        ],
        internalType: "struct VIVIFeeManager.FeeReceiver[]",
        name: "additionalFeeReceivers",
        type: "tuple[]",
      },
    ],
    name: "VIVIBuy",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "Currency", name: "currency0", type: "address" },
          { internalType: "Currency", name: "currency1", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "int24", name: "tickSpacing", type: "int24" },
          { internalType: "contract IHooks", name: "hooks", type: "address" },
        ],
        internalType: "struct PoolKey",
        name: "key",
        type: "tuple",
      },
      { internalType: "uint128", name: "amountIn", type: "uint128" },
      { internalType: "uint128", name: "minAmountOut", type: "uint128" },
      { internalType: "uint256", name: "feeBps", type: "uint256" },
      {
        components: [
          { internalType: "address", name: "receiver", type: "address" },
          { internalType: "uint256", name: "bps", type: "uint256" },
        ],
        internalType: "struct VIVIFeeManager.FeeReceiver[]",
        name: "additionalFeeReceivers",
        type: "tuple[]",
      },
    ],
    name: "VIVISell",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // Permit2 functions
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint160", name: "amount", type: "uint160" },
      { internalType: "uint48", name: "expiration", type: "uint48" },
    ],
    name: "approveTokenPermit2",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint160", name: "amount", type: "uint160" },
      { internalType: "uint48", name: "expiration", type: "uint48" },
    ],
    name: "approveWETHPermit2",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // View functions
  {
    inputs: [],
    name: "WETH9",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "defaultFeeReceiver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "permit2",
    outputs: [{ internalType: "contract IPermit2", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "universalRouter",
    outputs: [
      { internalType: "contract IUniversalRouter", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },

  // Owner functions
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "_defaultFeeReceiver", type: "address" },
    ],
    name: "setDefaultFeeReceiver",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // Receive function
  {
    stateMutability: "payable",
    type: "receive",
  },
] as const;
