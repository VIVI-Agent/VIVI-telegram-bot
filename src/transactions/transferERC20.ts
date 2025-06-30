import { type Address, type TransactionReceipt } from "viem";
import {
  getUserWalletClientQuickNode,
  publicClientQuickNode,
  publicClientBaseOficial,
  publicClientDRPC,
} from "@client";
import { logger } from "@logger";
import { AddressValidator } from "@utils";
import { ERC20_ABI } from "abis/erc20/erc20";

// Create Base official RPC client if needed

export async function transferERC20(
  privateKey: `0x${string}`,
  tokenAddress: Address,
  toAddress: Address,
  amount: bigint,
  confirmations: number
): Promise<{
  txHash: `0x${string}`;
  waitReceipt: Promise<TransactionReceipt>;
}> {
  try {
    const walletClient = getUserWalletClientQuickNode(privateKey);
    const address = AddressValidator.parseEthereumAddress(tokenAddress);
    const to = AddressValidator.parseEthereumAddress(toAddress);
    if (address && to) {
      const txHash = await walletClient.writeContract({
        address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amount],
      });

      // Create a persistent waitReceipt function that won't give up
      const waitReceipt = async (): Promise<TransactionReceipt> => {
        const startTime = Date.now();
        const MAX_WAIT_TIME = 180000; // 3 minutes in milliseconds

        // Keep trying until we get a receipt or timeout
        while (Date.now() - startTime < MAX_WAIT_TIME) {
          logger.info(
            `Checking receipt for ${txHash} (elapsed: ${Math.floor(
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
              logger.info(`QuickNode direct check success for ${txHash}`);
              return receipt;
            }
          } catch (error1: any) {
            logger.debug(`QuickNode direct check failed: ${error1.message}`);
          }

          // 2. Try DRPC if available
          try {
            const receipt = await publicClientDRPC.getTransactionReceipt({
              hash: txHash,
            });
            if (receipt && (await validateReceipt(receipt, confirmations))) {
              logger.info(`DRPC direct check success for ${txHash}`);
              return receipt;
            }
          } catch (error2: any) {
            logger.debug(`DRPC check failed: ${error2.message}`);
          }

          // 3. Try Base Official RPC
          try {
            const receipt = await publicClientBaseOficial.getTransactionReceipt(
              {
                hash: txHash,
              }
            );
            if (receipt && (await validateReceipt(receipt, confirmations))) {
              logger.info(`Base Official direct check success for ${txHash}`);
              return receipt;
            }
          } catch (error3: any) {
            logger.debug(`Base Official check failed: ${error3.message}`);
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
              `Still searching for receipt: ${elapsed}s elapsed, ${remaining}s remaining`
            );
          }
        }

        // If we exit the loop, we've timed out
        throw new Error(
          `Timed out after 3 minutes waiting for receipt for ${txHash}`
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
          logger.debug(`Error checking confirmations: ${error}`);
          // Even if checking confirmations fails, accept receipt as valid for Base
          return true;
        }
      }

      return {
        txHash,
        waitReceipt: waitReceipt(), // Return the promise from our custom function
      };
    } else {
      throw new Error("Sorry kiddo, token transfer failed.");
    }
  } catch (error) {
    logger.error(error);
    throw new Error("Sorry kiddo, token transfer failed.");
  }
}
