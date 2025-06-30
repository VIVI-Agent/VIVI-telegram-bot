import { publicClientDRPC } from "@client";
import { logger } from "@logger";
import { Address, formatEther } from "viem";

export async function getWalletBalance(address: Address): Promise<bigint> {
  try {
    const wethBalance = await publicClientDRPC.getBalance({
      address: address,
    });
    logger.info(`Wallet: ${address} - Balance ${formatEther(wethBalance)}`);
    return wethBalance;
  } catch (error) {
    logger.error(`Failed to fetch balance for wallet ${address}:`, error);
    throw new Error("Failed to fetch wallet balance.");
  }
}
