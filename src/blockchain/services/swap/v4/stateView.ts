// src/blockchain/services/swap/v4/stateView.ts
import { Address, createPublicClient } from "viem";
import { STATE_VIEW_ADDRESS } from "./constants";

export const STATE_VIEW_ABI = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

export async function checkPoolExists(
  publicClient: ReturnType<typeof createPublicClient>,
  poolId: string
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: STATE_VIEW_ADDRESS as Address,
      abi: STATE_VIEW_ABI,
      functionName: "getSlot0",
      args: [poolId as `0x${string}`],
    });

    return result && result[0] > 0n;
  } catch {
    return false;
  }
}

