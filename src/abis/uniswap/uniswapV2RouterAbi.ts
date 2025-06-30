// src/abis/uniswapV2RouterAbi.ts
import type { Abi } from "abitype";

export const uniswapV2RouterAbi = [
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "amountIn",
        type: "uint256",
      },
      {
        name: "path",
        type: "address[]",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256[]",
      },
    ],
  },
] as const satisfies Abi;
