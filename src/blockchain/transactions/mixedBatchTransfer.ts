import { type Address, type TransactionReceipt, parseEther } from "viem";
import {
  getUserWalletClientQuickNode,
  publicClientQuickNode,
  publicClientBaseOficial,
  publicClientDRPC,
} from "../../client/viemClient";
import { VIVIMixedBatchTransferABI } from "../../abis/erc20/VIVIMixedBatchTransferABI";
import { logger } from "logger/logger";
import { AddressValidator } from "@utils";
import { contracts } from "@config";

export interface MixedBatchTransferParams {
  privateKey: `0x${string}`;
  tokenAddress: Address;
  recipients: Address[];
  tokenAmountEach: bigint;
  ethAmountEach: string; // ETH amount as string (e.g., "0.0000069")
  confirmations: number;
}

/**
 * Executes a mixed batch transfer (tokens + ETH) using the VIVIMixedBatchTransfer contract.
 */
export async function mixedBatchTransfer(
  params: MixedBatchTransferParams
): Promise<{
  txHash: `0x${string}`;
  waitReceipt: Promise<TransactionReceipt>;
}> {
  const {
    privateKey,
    tokenAddress,
    recipients,
    tokenAmountEach,
    ethAmountEach,
    confirmations,
  } = params;

  try {
    logger.info(
      `[mixedBatchTransfer] Mixed batch transfer to ${recipients.length} recipients with ${ethAmountEach} ETH each`
    );

    const walletClient = getUserWalletClientQuickNode(privateKey);
    const parsedTokenAddress =
      AddressValidator.parseEthereumAddress(tokenAddress);
    const mixedBatchContractAddress = AddressValidator.parseEthereumAddress(
      contracts.VIVI_MIXED_BATCH_TRANSFER_CONTRACT_ADDRESS
    );

    if (!parsedTokenAddress || !mixedBatchContractAddress) {
      throw new Error("Invalid token or mixed batch contract address");
    }

    // Validate all recipient addresses
    const validRecipients = recipients.map((recipient) => {
      const parsed = AddressValidator.parseEthereumAddress(recipient);
      if (!parsed) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }
      return parsed;
    });

    // Convert ETH amount from string to bigint
    const ethAmountEachBigInt = parseEther(ethAmountEach);
    const totalEthAmount = ethAmountEachBigInt * BigInt(recipients.length);

    logger.info(
      `[mixedBatchTransfer] Token: ${parsedTokenAddress}, Recipients: ${recipients.length}, TokenAmount: ${tokenAmountEach}, ETHAmount: ${ethAmountEach} (${ethAmountEachBigInt}), TotalETH: ${totalEthAmount}`
    );

    const txHash = await walletClient.writeContract({
      address: mixedBatchContractAddress,
      abi: VIVIMixedBatchTransferABI,
      functionName: "mixedBatchTransferEqual",
      args: [
        parsedTokenAddress,
        validRecipients,
        tokenAmountEach,
        ethAmountEachBigInt,
      ],
      value: totalEthAmount,
    });

    // Create a persistent waitReceipt function similar to batchTransferERC20
    const waitReceipt = async (): Promise<TransactionReceipt> => {
      const startTime = Date.now();
      const MAX_WAIT_TIME = 180000; // 3 minutes in milliseconds

      // Keep trying until we get a receipt or timeout
      while (Date.now() - startTime < MAX_WAIT_TIME) {
        logger.info(
          `[mixedBatchTransfer] Checking receipt for ${txHash} (elapsed: ${Math.floor(
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
              `[mixedBatchTransfer] QuickNode direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error1: any) {
          logger.debug(
            `[mixedBatchTransfer] QuickNode direct check failed: ${error1.message}`
          );
        }

        // 2. Try DRPC if available
        try {
          const receipt = await publicClientDRPC.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[mixedBatchTransfer] DRPC direct check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error2: any) {
          logger.debug(
            `[mixedBatchTransfer] DRPC direct check failed: ${error2.message}`
          );
        }

        // 3. Try official Base client
        try {
          const receipt = await publicClientBaseOficial.getTransactionReceipt({
            hash: txHash,
          });
          if (receipt && (await validateReceipt(receipt, confirmations))) {
            logger.info(
              `[mixedBatchTransfer] Base official check success for ${txHash}`
            );
            return receipt;
          }
        } catch (error3: any) {
          logger.debug(
            `[mixedBatchTransfer] Base official check failed: ${error3.message}`
          );
        }

        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      throw new Error(
        `Transaction receipt not found after ${MAX_WAIT_TIME / 1000} seconds`
      );
    };

    logger.info(`[mixedBatchTransfer] Transaction sent: ${txHash}`);
    return { txHash, waitReceipt: waitReceipt() };
  } catch (error: any) {
    logger.error(`[mixedBatchTransfer] Error:`, error);
    throw error;
  }
}

/**
 * Validates a transaction receipt has the required confirmations
 */
async function validateReceipt(
  receipt: TransactionReceipt,
  requiredConfirmations: number
): Promise<boolean> {
  if (!receipt.blockNumber) {
    return false;
  }

  try {
    const currentBlock = await publicClientQuickNode.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);

    logger.debug(
      `[mixedBatchTransfer] Block ${receipt.blockNumber}, Current: ${currentBlock}, Confirmations: ${confirmations}/${requiredConfirmations}`
    );

    return confirmations >= requiredConfirmations;
  } catch (error) {
    logger.debug(`[mixedBatchTransfer] Error checking confirmations:`, error);
    return false;
  }
}
