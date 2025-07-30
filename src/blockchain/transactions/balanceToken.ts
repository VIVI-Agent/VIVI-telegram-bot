import { publicClientDRPC } from "@client";
import { ERC20_ABI } from "abis/erc20/erc20";
import { Address, PublicClient } from "viem";

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

  const balance = await publicClientDRPC.readContract({
    address: tokenAddress.toLowerCase() as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return balance;
}

export async function getTokenBalanceDRPC(
  tokenAddress: Address,
  userAddress: Address,
  publicClient: PublicClient
): Promise<bigint> {
  // Validate inputs
  if (!tokenAddress) {
    throw new Error("Token address is required");
  }

  if (!userAddress) {
    throw new Error("User address is required");
  }

  const balance = await publicClient.readContract({
    address: tokenAddress.toLowerCase() as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return balance;
}
