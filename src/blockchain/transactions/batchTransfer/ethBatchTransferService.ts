import { type Address, type TransactionReceipt } from "viem";
import { GlobalSceneContext } from "@types";
import { Wallet } from "@prisma/client";
import { contracts } from "@config";
import { logger } from "@logger";
import {
  getUserWalletClientQuickNode,
  publicClientBaseOficial,
  publicClientDRPC,
  publicClientQuickNode,
} from "@client";
import { AddressValidator } from "@utils";
import { transferETH } from "../transferETH";
import { VIVIETHBatchTransferABI } from "@abis";

export interface ETHTransferRecipient {
  address: Address;
  userId?: number; // For balance updates
  displayName: string;
  type: "address" | "bns" | "username";
}

export interface ETHBatchTransferServiceParams {
  ctx: GlobalSceneContext;
  privateKey: `0x${string}`;
  recipients: ETHTransferRecipient[];
  amountEach: bigint;
  senderWallet: Wallet;
  confirmations?: number;
}

export interface ETHBatchTransferParams {
  privateKey: `0x${string}`;
  recipients: Address[];
  amountEach: bigint;
  confirmations: number;
}

/**
 * Service that handles ETH batch transfers using the dedicated ETH batch contract.
 * For single recipients, uses normal ETH transfer.
 * For multiple recipients, uses batchETHTransferEqual function with native ETH.
 */
export async function ethBatchTransferService(
  params: ETHBatchTransferServiceParams
) {
  const {
    ctx,
    privateKey,
    recipients,
    amountEach,
    senderWallet,
    confirmations = 1,
  } = params;

  const logPrefix = "[ethBatchTransferService]";

  try {
    // Extract recipient addresses
    const recipientAddresses = recipients.map((r) => r.address);

    // Calculate total ETH amount needed
    const totalAmount = amountEach * BigInt(recipients.length);

    // Check sender has enough ETH
    const walletClient = getUserWalletClientQuickNode(privateKey);
    const balance = await publicClientQuickNode.getBalance({
      address: walletClient.account.address as Address,
    });

    if (balance < totalAmount) {
      throw new Error(
        `Insufficient ETH balance. Required: ${totalAmount} wei, Available: ${balance} wei`
      );
    }

    if (recipients.length === 1) {
      logger.info(`${logPrefix} Single recipient, using normal ETH transfer`);

      // Use existing transferETH for single recipient
      const result = await transferETH({
        privateKey,
        to: recipientAddresses[0],
        desiredAmountWei: amountEach,
      });

      return {
        ...result,
        recipients, // Return original recipient info for balance updates
        totalAmount,
        isBatchTransfer: false,
      };
    } else {
      logger.info(
        `${logPrefix} Multiple recipients (${recipients.length}), using ETH batch transfer`
      );

      // Execute the ETH batch transfer
      const result = await batchTransferETH({
        privateKey,
        recipients: recipientAddresses,
        amountEach,
        confirmations,
      });

      logger.info(
        `${logPrefix} ETH batch transfer submitted successfully: ${result.txHash}`
      );

      return {
        ...result,
        recipients, // Return original recipient info for balance updates
        totalAmount,
        isBatchTransfer: true,
      };
    }
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);
    throw error;
  }
}

/**
 * Executes a batch ETH transfer using the VIVIETHBatchTransferABI contract.
 * Uses batchETHTransferEqual function for native ETH transfers.
 */
export async function batchTransferETH(
  params: ETHBatchTransferParams
): Promise<{
  txHash: `0x${string}`;
  waitReceipt: Promise<TransactionReceipt>;
}> {
  const { privateKey, recipients, amountEach, confirmations } = params;

  try {
    logger.info(
      `[batchTransferETH] ETH batch transfer to ${recipients.length} recipients`
    );

    const walletClient = getUserWalletClientQuickNode(privateKey);
    const ethBatchContractAddress = AddressValidator.parseEthereumAddress(
      contracts.ETH_BATCH_ADDRESS
    );

    if (!ethBatchContractAddress) {
      throw new Error("Invalid ETH batch contract address");
    }

    // Validate all recipient addresses
    const validRecipients = recipients.map((recipient) => {
      const parsed = AddressValidator.parseEthereumAddress(recipient);
      if (!parsed) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }
      return parsed;
    });

    // Calculate total ETH needed for the transaction
    const totalEthAmount = amountEach * BigInt(recipients.length);

    const txHash = await walletClient.writeContract({
      address: ethBatchContractAddress,
      abi: VIVIETHBatchTransferABI,
      functionName: "batchETHTransferEqual",
      args: [validRecipients, amountEach],
      value: totalEthAmount, // Send the total ETH amount with the transaction
    });

    // Create a persistent waitReceipt function similar to other batch transfers
    const waitReceipt = async (): Promise<TransactionReceipt> => {
      const startTime = Date.now();
      const MAX_WAIT_TIME = 180000; // 3 minutes in milliseconds

      // Keep trying until we get a receipt or timeout
      while (Date.now() - startTime < MAX_WAIT_TIME) {
        logger.info(
          `[batchTransferETH] Checking receipt for ${txHash} (elapsed: ${Math.floor(
            (Date.now() - startTime) / 1000
          )}s)`
        );

        // Try all RPC providers in sequence
        // 1. Try QuickNode direct check
        try {
          const receipt = await publicClientQuickNode.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[batchTransferETH] QuickNode direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error1: any) {
          logger.debug(
            `[batchTransferETH] QuickNode direct check failed: ${error1.message}`
          );
        }

        // 2. Try DRPC if available
        try {
          const receipt = await publicClientDRPC.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[batchTransferETH] DRPC direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error2: any) {
          logger.debug(
            `[batchTransferETH] DRPC check failed: ${error2.message}`
          );
        }

        // 3. Try Base Official RPC
        try {
          const receipt = await publicClientBaseOficial.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[batchTransferETH] Base Official direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error3: any) {
          logger.debug(
            `[batchTransferETH] Base Official check failed: ${error3.message}`
          );
        }

        // If we get here, none of the approaches worked this iteration
        // Wait a bit before next attempt
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Log progress periodically
        if ((Date.now() - startTime) % 5000 < 1000) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = Math.floor(
            (MAX_WAIT_TIME - (Date.now() - startTime)) / 1000
          );
          logger.info(
            `[batchTransferETH] Still searching for receipt: ${elapsed}s elapsed, ${remaining}s remaining`
          );
        }
      }

      // If we exit the loop, we've timed out
      throw new Error(
        `[batchTransferETH] Timed out after 3 minutes waiting for receipt for ${txHash}`
      );
    };

    // Helper to validate receipt has enough confirmations
    async function validateReceipt(
      receipt: TransactionReceipt,
      requiredConfirmations: number
    ): Promise<boolean> {
      // For Base chain, if we got a receipt, it's likely good enough
      // Only check confirmations if explicitly required
      if (requiredConfirmations <= 1) return true;

      try {
        const currentBlock = await publicClientQuickNode.getBlockNumber();
        return currentBlock - receipt.blockNumber >= requiredConfirmations;
      } catch (error: any) {
        logger.debug(
          `[batchTransferETH] Error checking confirmations: ${error}`
        );
        // Even if checking confirmations fails, accept receipt as valid for Base
        return true;
      }
    }

    return {
      txHash,
      waitReceipt: waitReceipt(), // Return the promise from our custom function
    };
  } catch (error) {
    logger.error(`[batchTransferETH] Error:`, error);
    throw new Error("Sorry kiddo, ETH batch transfer failed.");
  }
}
