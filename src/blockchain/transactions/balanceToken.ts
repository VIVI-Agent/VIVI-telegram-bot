import { publicClientQuickNode } from "@client";
import { ERC20_ABI } from "abis/erc20/erc20";
import { Address } from "viem";

export async function getTokenBalance(
  tokenAddress: Address,
  userAddress: Address
): Promise<bigint> {
  // Validate inputs
  if (!tokenAddress) {
    throw new Error("Token address is required");
  }

  if (!userAddress) {
    throw new Error("User address is required");
  }

  const balance = await publicClientQuickNode.readContract({
    address: tokenAddress.toLowerCase() as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return balance;
}
