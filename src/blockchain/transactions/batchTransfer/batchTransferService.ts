import { type Address } from "viem";
import { GlobalSceneContext } from "@types";
import { Wallet } from "@prisma/client";
import { contracts } from "@config";
import { logger } from "@logger";
import { ensureAllowanceLogic } from "blockchain/services/token";
import {
  getUserWalletClientQuickNode,
  publicClientBaseOficial,
  publicClientDRPC,
  publicClientQuickNode,
} from "@client";
import { TransactionReceipt } from "viem";
import { AddressValidator } from "@utils";
import { transferERC20 } from "../transferERC20";
import { VIVIBatchTransferABI } from "@abis";

export interface TransferRecipient {
  address: Address;
  userId?: number; // For balance updates
  displayName: string;
  type: "address" | "bns" | "username";
}

export interface BatchTransferServiceParams {
  ctx: GlobalSceneContext;
  privateKey: `0x${string}`;
  tokenAddress: Address;
  recipients: TransferRecipient[];
  amountEach: bigint;
  senderWallet: Wallet;
  confirmations?: number;
}

export interface BatchTransferParams {
  privateKey: `0x${string}`;
  tokenAddress: Address;
  recipients: Address[];
  amountEach: bigint;
  confirmations: number;
}

/**
 * Service that handles both single and batch transfers with proper allowance management.
 * When sending to multiple recipients, it uses the batch contract and ensures allowance.
 * When sending to a single recipient, it uses normal ERC20 transfer.
 */
export async function batchTransferService(params: BatchTransferServiceParams) {
  const {
    ctx,
    privateKey,
    tokenAddress,
    recipients,
    amountEach,
    senderWallet,
    confirmations = 1,
  } = params;

  const logPrefix = "[batchTransferService]";

  try {
    // Extract recipient addresses
    const recipientAddresses = recipients.map((r) => r.address);

    // If multiple recipients, we need to approve the batch contract
    if (recipients.length > 1) {
      logger.info(
        `${logPrefix} Multiple recipients (${recipients.length}), using batch transfer`
      );

      // Calculate total amount needed for approval
      const totalAmount = amountEach * BigInt(recipients.length);

      // Ensure allowance for batch contract
      await ensureAllowanceLogic(ctx, {
        walletEntity: senderWallet,
        tokenAddress,
        requiredAmount: totalAmount,
        spender: contracts.ERC20_BATCH_ADDRESS as Address,
        privateKey,
      });

      logger.info(`${logPrefix} Allowance ensured, executing batch transfer`);
    } else {
      logger.info(`${logPrefix} Single recipient, using normal transfer`);
    }

    // Execute the transfer (batch service handles single vs multiple internally)
    const result = await batchTransferERC20({
      privateKey,
      tokenAddress,
      recipients: recipientAddresses,
      amountEach,
      confirmations,
    });

    logger.info(
      `${logPrefix} Transfer submitted successfully: ${result.txHash}`
    );

    return {
      ...result,
      recipients, // Return original recipient info for balance updates
      totalAmount: amountEach * BigInt(recipients.length),
      isBatchTransfer: recipients.length > 1,
    };
  } catch (error) {
    logger.error(`${logPrefix} Error:`, error);
    throw error;
  }
}

/**
 * Executes a batch transfer using the VIVIBatchTransferABI contract.
 * For single recipients, uses normal ERC20 transfer.
 * For multiple recipients, uses batchTransferEqual function.
 */
export async function batchTransferERC20(params: BatchTransferParams): Promise<{
  txHash: `0x${string}`;
  waitReceipt: Promise<TransactionReceipt>;
}> {
  const { privateKey, tokenAddress, recipients, amountEach, confirmations } =
    params;

  try {
    // If only one recipient, use normal ERC20 transfer
    if (recipients.length === 1) {
      logger.info(
        `[batchTransferERC20] Single recipient detected, using normal transfer`
      );

      return await transferERC20(
        privateKey,
        tokenAddress,
        recipients[0],
        amountEach,
        confirmations
      );
    }

    // Multiple recipients - use batch transfer
    logger.info(
      `[batchTransferERC20] Batch transfer to ${recipients.length} recipients`
    );

    const walletClient = getUserWalletClientQuickNode(privateKey);
    const parsedTokenAddress =
      AddressValidator.parseEthereumAddress(tokenAddress);
    const batchContractAddress = AddressValidator.parseEthereumAddress(
      contracts.ERC20_BATCH_ADDRESS
    );

    if (!parsedTokenAddress || !batchContractAddress) {
      throw new Error("Invalid token or batch contract address");
    }

    // Validate all recipient addresses
    const validRecipients = recipients.map((recipient) => {
      const parsed = AddressValidator.parseEthereumAddress(recipient);
      if (!parsed) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }
      return parsed;
    });

    const txHash = await walletClient.writeContract({
      address: batchContractAddress,
      abi: VIVIBatchTransferABI,
      functionName: "batchTransferEqual",
      args: [parsedTokenAddress, validRecipients, amountEach],
    });

    // Create a persistent waitReceipt function similar to transferERC20
    const waitReceipt = async (): Promise<TransactionReceipt> => {
      const startTime = Date.now();
      const MAX_WAIT_TIME = 180000; // 3 minutes in milliseconds

      // Keep trying until we get a receipt or timeout
      while (Date.now() - startTime < MAX_WAIT_TIME) {
        logger.info(
          `[batchTransferERC20] Checking receipt for ${txHash} (elapsed: ${Math.floor(
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
              `[batchTransferERC20] QuickNode direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error1: any) {
          logger.debug(
            `[batchTransferERC20] QuickNode direct check failed: ${error1.message}`
          );
        }

        // 2. Try DRPC if available
        try {
          const receipt = await publicClientDRPC.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[batchTransferERC20] DRPC direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error2: any) {
          logger.debug(
            `[batchTransferERC20] DRPC check failed: ${error2.message}`
          );
        }

        // 3. Try Base Official RPC
        try {
          const receipt = await publicClientBaseOficial.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[batchTransferERC20] Base Official direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error3: any) {
          logger.debug(
            `[batchTransferERC20] Base Official check failed: ${error3.message}`
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
            `[batchTransferERC20] Still searching for receipt: ${elapsed}s elapsed, ${remaining}s remaining`
          );
        }
      }

      // If we exit the loop, we've timed out
      throw new Error(
        `[batchTransferERC20] Timed out after 3 minutes waiting for receipt for ${txHash}`
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
          `[batchTransferERC20] Error checking confirmations: ${error}`
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
    logger.error(`[batchTransferERC20] Error:`, error);
    throw new Error("Sorry kiddo, batch transfer failed.");
  }
}
