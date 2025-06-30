import { publicClientDRPC } from "@client";
import { ERC20_ABI } from "abis/erc20/erc20";
import { Address } from "viem";

export async function getTokenBalance(
  tokenAddress: Address,
  userAddress: Address
): Promise<bigint> {
  const balance = await publicClientDRPC.readContract({
    address: tokenAddress.toLowerCase() as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return balance;
}
