// src/services/approveInfinite.ts

import { Address, Hash, Hex, TransactionReceipt } from "viem";
import { ERC20_ABI } from "@abis";
import { getUserWalletClientQuickNode, publicClientQuickNode } from "@client";

const MAX_UINT256 =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

export async function approveInfinite(
  tokenAddress: Address,
  spender: Address,
  userPrivateKey: Hex
): Promise<{ txHash: Hash; waitReceipt: Promise<TransactionReceipt> }> {
  const walletClient = getUserWalletClientQuickNode(userPrivateKey);

  const txHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, MAX_UINT256],
  });

  return {
    txHash,
    waitReceipt: publicClientQuickNode.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2,
    }),
  };
}
