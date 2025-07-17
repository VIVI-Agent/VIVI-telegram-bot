// src/abis/wrappers/VIVIAerodromeABI.ts
import type { Abi } from "abitype";

export const VIVIAerodromeABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_router",
        type: "address",
      },
      {
        internalType: "address",
        name: "_feeReceiver",
        type: "address",
      },
      {
        internalType: "address",
        name: "_weth",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
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
      {
        indexed: true,
        internalType: "address",
        name: "newFeeReceiver",
        type: "address",
      },
    ],
    name: "DefaultFeeReceiverUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
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
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "newRouter",
        type: "address",
      },
    ],
    name: "RouterUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenIn",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenAmountIn",
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
      {
        indexed: true,
        internalType: "address",
        name: "newWETH",
        type: "address",
      },
    ],
    name: "WETHUpdated",
    type: "event",
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "from",
                type: "address",
              },
              {
                internalType: "address",
                name: "to",
                type: "address",
              },
              {
                internalType: "bool",
                name: "stable",
                type: "bool",
              },
              {
                internalType: "address",
                name: "factory",
                type: "address",
              },
            ],
            internalType: "struct VIVIAerodrome.Route[]",
            name: "routes",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "amountIn",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "recipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256",
          },
        ],
        internalType: "struct VIVIAerodrome.SwapParams",
        name: "params",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "feeBps",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "slippagePercent",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "bps",
            type: "uint256",
          },
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
          {
            components: [
              {
                internalType: "address",
                name: "from",
                type: "address",
              },
              {
                internalType: "address",
                name: "to",
                type: "address",
              },
              {
                internalType: "bool",
                name: "stable",
                type: "bool",
              },
              {
                internalType: "address",
                name: "factory",
                type: "address",
              },
            ],
            internalType: "struct VIVIAerodrome.Route[]",
            name: "routes",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "amountIn",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "recipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256",
          },
        ],
        internalType: "struct VIVIAerodrome.SwapParams",
        name: "params",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "feeBps",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "slippagePercent",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "bps",
            type: "uint256",
          },
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
  {
    inputs: [],
    name: "WETH",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "aerodromeRouter",
    outputs: [
      {
        internalType: "contract IAerodromeRouter",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "defaultFeeReceiver",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_defaultFeeReceiver",
        type: "address",
      },
    ],
    name: "setDefaultFeeReceiver",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_r",
        type: "address",
      },
    ],
    name: "setRouter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_newWETH",
        type: "address",
      },
    ],
    name: "setWETH",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
] as const satisfies Abi;
