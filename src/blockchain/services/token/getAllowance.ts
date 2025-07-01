// allowanceService.ts

import { Hex } from "viem";
import { ERC20_ABI } from "@abis";
import { publicClientDRPC } from "@client";

export async function getAllowance(
  tokenAddress: Hex,
  owner: Hex,
  spender: Hex
): Promise<bigint> {
  const allowance = await publicClientDRPC.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });
  return allowance;
}
