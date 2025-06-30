// src/services/transferETH.ts

import { getUserWalletClientQuickNode, publicClientQuickNode } from "@client";
import { logger } from "@logger";
import { formatEther, getAddress } from "viem";
import type { Address, TransactionReceipt } from "viem";

export async function transferETH({
  privateKey,
  to,
  desiredAmountWei,
}: {
  privateKey: `0x${string}`;
  to: Address;
  desiredAmountWei: bigint;
}): Promise<{
  txHash: `0x${string}`;
  waitReceipt: Promise<TransactionReceipt>;
}> {
  try {
    const walletClient = getUserWalletClientQuickNode(privateKey);
    const from = walletClient.account.address as Address;

    const toAddr = getAddress(to);

    const balance = await publicClientQuickNode.getBalance({ address: from });
    logger.info(`  - Current balance of ${from}: ${balance} wei`);

    if (balance < desiredAmountWei) {
      throw new Error(
        `Sorry kiddo, you only have ${formatEther(balance)} ETH.`
      );
    }

    const txHash = await walletClient.sendTransaction({
      to: toAddr,
      value: desiredAmountWei,
    });
    logger.info(`  - Sent transaction. Hash: ${txHash}`);

    const waitReceipt = publicClientQuickNode.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2,
    });
    return { txHash, waitReceipt };
  } catch (error) {
    throw new Error("Sorry kiddo, eth transfer failed.");
  }
}
