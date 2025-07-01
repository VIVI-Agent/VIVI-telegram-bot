// src/services/getTokenData.ts
import type { Address } from "viem";
import { publicClientDRPC } from "@client";
import { ERC20_ABI } from "@abis";
import { logger } from "@logger";
import { Token } from "@prisma/client";

export async function getTokenInfo(address: Address): Promise<Partial<Token>> {
  try {
    const normalizedAddress = address.toLowerCase() as Address;

    const [name, symbol, decimals] = await Promise.all([
      publicClientDRPC.readContract({
        address: normalizedAddress,
        abi: ERC20_ABI,
        functionName: "name",
      }),
      publicClientDRPC.readContract({
        address: normalizedAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
      publicClientDRPC.readContract({
        address: normalizedAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
    ]);

    const decimalsNum = Number(decimals);

    return {
      name,
      symbol,
      decimals: decimalsNum,
    };
  } catch (error: any) {
    logger.error(`Error fetching token data ${address}:`);
    throw new Error(`Error fetching token data ${address}`);
  }
}
