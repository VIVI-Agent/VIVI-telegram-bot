// src/services/swap/priceComparisonService.ts

import { Address, createPublicClient, formatUnits } from "viem";
import {
  uniswapV2RouterAbi,
  uniswapV3QuoterAbi,
  aerodromeRouterAbi,
  apeStoreRouterAbi,
} from "@abis";
import { logger } from "@logger";
import { contracts } from "@config";
import { getV4QuoteBuy } from "../swap/v4/quoter";

const ONLYSUMMARY = false;

export interface DexQuoteResultBuy {
  dexName: string;
  amountOut: string;
  formattedOut: string;
  feeTier: number;
  path?: string; // Para multi-hop
  fees?: number[]; // Para multi-hop con multiple fees
  poolKey?: any; // Para V4
  poolId?: string; // Para V4
}

/**
 * UniswapV2
 */
async function getQuoteUniswapV2(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultBuy | null> {
  try {
    const path: Address[] = [contracts.ETH as Address, tokenOut];

    const amounts = (await publicClient.readContract({
      address: contracts.UNISWAPV2_ROUTER as Address,
      abi: uniswapV2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    })) as bigint[];

    const out = amounts[1]; // [in, out]
    const result = {
      dexName: "UniswapV2",
      amountOut: out.toString(),
      formattedOut: formatUnits(out, decimalsOut),
      feeTier: 3000,
    };

    if (!ONLYSUMMARY) {
      logger.info(
        `UniswapV2 BUY Quote: ${result.formattedOut} tokens for ${formatUnits(
          amountIn,
          18
        )} ETH`
      );
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(
        `UniswapV2 BUY failed - No pool available for token ${tokenOut}`
      );
    }
    return null;
  }
}

/**
 * UniswapV3
 */
async function getBestQuoteUniswapV3(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  feeTiers: number[],
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultBuy | null> {
  let bestAmountOut = 0n;
  let bestTier = 0;

  if (!ONLYSUMMARY) {
    logger.info(`UniswapV3 BUY - Testing fee tiers: [${feeTiers.join(", ")}]`);
  }

  for (const feeTier of feeTiers) {
    try {
      const result = await publicClient.readContract({
        address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
        abi: uniswapV3QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: contracts.ETH as Address,
            tokenOut: tokenOut,
            fee: feeTier,
            amountIn: amountIn,
            sqrtPriceLimitX96: 0, // sin limit
          },
        ],
      });
      const [amountOut] = result as [bigint, bigint, number, bigint];

      if (!ONLYSUMMARY) {
        logger.info(
          `  └─ Fee ${feeTier}: ${formatUnits(amountOut, decimalsOut)} tokens`
        );
      }

      if (amountOut > bestAmountOut) {
        bestAmountOut = amountOut;
        bestTier = feeTier;
      }
    } catch (err) {
      if (!ONLYSUMMARY) {
        logger.error(`  └─ Fee ${feeTier}: No pool available`);
      }
    }
  }

  if (bestAmountOut === 0n) {
    if (!ONLYSUMMARY) {
      logger.error(`UniswapV3 BUY - No pools found for any fee tier`);
    }
    return null;
  }

  const result = {
    dexName: "UniswapV3",
    amountOut: bestAmountOut.toString(),
    formattedOut: formatUnits(bestAmountOut, decimalsOut),
    feeTier: bestTier,
  };

  if (!ONLYSUMMARY) {
    logger.info(
      `UniswapV3 BUY Best Quote: ${result.formattedOut} tokens (fee: ${bestTier})`
    );
  }
  return result;
}

/**
 * Aerodrome
 */
async function getQuoteAerodrome(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  amountIn: bigint,
  decimalsOut: number,
  stable: boolean
): Promise<DexQuoteResultBuy | null> {
  const poolType = stable ? "Stable" : "Volatile";

  try {
    const WETH = contracts.ETH as Address;
    const router = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;
    const factory = stable
      ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address)
      : ("0x420dd381b31aef6683db6b902084cb0ffece40da" as Address);

    const routes = [
      {
        from: WETH,
        to: tokenOut,
        stable,
        factory,
      },
    ];

    const amounts = (await publicClient.readContract({
      address: router,
      abi: aerodromeRouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, routes],
    })) as bigint[];

    const out = amounts[amounts.length - 1];
    if (out === 0n) {
      if (!ONLYSUMMARY) {
        logger.error(`Aerodrome${poolType} BUY - Zero output amount`);
      }
      return null;
    }

    const result = {
      dexName: stable ? "AerodromeStable" : "AerodromeVolatile",
      amountOut: out.toString(),
      formattedOut: formatUnits(out, decimalsOut),
      feeTier: stable ? 500 : 3000,
    };

    if (!ONLYSUMMARY) {
      logger.info(
        `Aerodrome${poolType} BUY Quote: ${result.formattedOut} tokens`
      );
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`Aerodrome${poolType} BUY failed - No pool available`);
    }
    return null;
  }
}

async function getQuoteApeStoreBuy(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultBuy | null> {
  try {
    const amount = await publicClient.readContract({
      address: contracts.APESTORE_ROUTER_ADDRESS as Address,
      abi: apeStoreRouterAbi,
      functionName: "buyQuote",
      args: [tokenOut, amountIn],
    });

    const result = {
      dexName: "ApeStore",
      amountOut: amount.toString(),
      formattedOut: formatUnits(amount, decimalsOut),
      feeTier: 3000, // ApeStore uses a fixed fee tier
    };

    if (!ONLYSUMMARY) {
      logger.info(`ApeStore BUY Quote: ${result.formattedOut} tokens`);
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`ApeStore BUY failed - ${err}`);
    }
    return null;
  }
}

async function getZoraMultiHopQuoteBuy(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultBuy | null> {
  // Fijas las fees específicas para cada salto:
  // ETH → USDC: 500 (0.05%)
  // USDC → ZORA: 3000 (0.3%)
  // ZORA → TOKEN: 10000 (1%)
  const fee1 = 500; // ETH → USDC
  const fee2 = 3000; // USDC → ZORA
  const fee3 = 10000; // ZORA → TOKEN
  const fees = [fee1, fee2, fee3];

  if (!ONLYSUMMARY) {
    logger.info(
      `ZoraMultiHop BUY - Path: ETH → USDC (${fee1}) → ZORA (${fee2}) → TOKEN (${fee3})`
    );
  }

  try {
    // Construir el path para exactInput multi-hop
    // Path format: tokenA + fee + tokenB + fee + tokenC + fee + tokenD
    const path = `0x${[
      contracts.ETH.slice(2), // Remove 0x prefix
      fee1.toString(16).padStart(6, "0"), // fee as 3 bytes hex
      contracts.USDC_TOKEN_ADDRESS.slice(2),
      fee2.toString(16).padStart(6, "0"),
      contracts.ZORA_TOKEN_ADDRESS.slice(2),
      fee3.toString(16).padStart(6, "0"),
      tokenOut.slice(2),
    ].join("")}`;

    const result = await publicClient.readContract({
      address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
      abi: uniswapV3QuoterAbi,
      functionName: "quoteExactInput",
      args: [path as Address, amountIn],
    });

    const [amountOut] = result as [bigint, bigint[], number[], bigint];

    const quoteResult = {
      dexName: "ZoraMultiHop",
      amountOut: amountOut.toString(),
      formattedOut: formatUnits(amountOut, decimalsOut),
      feeTier: fees[0], // Keeping the first fee for compatibility
      path: path,
      fees: fees,
    };

    if (!ONLYSUMMARY) {
      logger.info(
        `ZoraMultiHop BUY Quote: ${
          quoteResult.formattedOut
        } tokens (fees: ${fees.join(",")})`
      );
    }
    return quoteResult;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(
        `ZoraMultiHop BUY failed - fees=[${fees.join(",")}] - ${err}`
      );
    }
    return null;
  }
}

/**
 * Compare V2, V3 (multi-tier), Aerodrome (stable/volatile), and Zora Multi-hop.
 */
async function getVirtualTokenQuoteBuy(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultBuy | null> {
  if (!ONLYSUMMARY) {
    logger.info(`VirtualToken BUY - Path: ETH → VIRTUAL → TOKEN`);
  }

  try {
    // VirtualToken route: ETH → VIRTUAL → TARGET_TOKEN
    // Using Uniswap V2 router for the path simulation
    const VIRTUAL_TOKEN_ADDRESS = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"; // VIRTUAL token address on Base
    const path: Address[] = [
      contracts.ETH as Address,
      VIRTUAL_TOKEN_ADDRESS as Address,
      tokenOut,
    ];

    const amounts = (await publicClient.readContract({
      address: contracts.UNISWAPV2_ROUTER as Address,
      abi: uniswapV2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    })) as bigint[];

    const out = amounts[2]; // [ETH, VIRTUAL, TARGET_TOKEN]
    const result = {
      dexName: "VirtualToken",
      amountOut: out.toString(),
      formattedOut: formatUnits(out, decimalsOut),
      feeTier: 3000, // Virtual uses V2 routing with default fee
      path: path.join("→"),
    };

    if (!ONLYSUMMARY) {
      logger.info(`VirtualToken BUY Quote: ${result.formattedOut} tokens`);
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`VirtualToken BUY failed - No pool available`);
    }
    return null;
  }
}

/**
 * UniswapV4
 */
async function getQuoteUniswapV4Buy(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenOut: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultBuy | null> {
  try {
    const v4Result = await getV4QuoteBuy(
      publicClient,
      tokenOut,
      amountIn,
      decimalsOut
    );

    if (!v4Result) {
      if (!ONLYSUMMARY) {
        logger.error(
          `UniswapV4 BUY failed - No pools found for token ${tokenOut}`
        );
      }
      return null;
    }

    const result = {
      dexName: "UniswapV4",
      amountOut: v4Result.amountOut,
      formattedOut: v4Result.formattedOut,
      feeTier: v4Result.feeTier,
      poolKey: v4Result.poolKey,
      poolId: v4Result.poolId,
    };

    if (!ONLYSUMMARY) {
      logger.info(
        `UniswapV4 BUY Quote: ${result.formattedOut} tokens for ${formatUnits(
          amountIn,
          18
        )} ETH (Pool: ${v4Result.poolId})`
      );
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`UniswapV4 BUY failed - ${err}`);
    }
    return null;
  }
}

export async function getBestDexForBuyEthToToken({
  publicClient,
  tokenOut,
  decimalsOut,
  feeTiers,
  amountEth,
}: {
  publicClient: ReturnType<typeof createPublicClient>;
  tokenOut: Address;
  decimalsOut: number;
  feeTiers: number[];
  amountEth: bigint;
}) {
  logger.info(`\n=== BUY COMPARISON START ===`);
  logger.info(`Token: ${tokenOut}`);
  logger.info(`Amount ETH: ${formatUnits(amountEth, 18)}`);
  logger.info(`Fee tiers: [${feeTiers.join(", ")}]`);
  logger.info(`==============================`);

  const tokenAddress = tokenOut.toLowerCase() as Address;
  const [
    v2Quote,
    v3Quote,
    aeroVolatile,
    aeroStable,
    apeStoreQuote,
    zoraMultiHop,
    virtualTokenQuote,
    v4Quote,
  ] = await Promise.all([
    getQuoteUniswapV2(publicClient, tokenAddress, amountEth, decimalsOut),
    getBestQuoteUniswapV3(
      publicClient,
      tokenAddress,
      feeTiers,
      amountEth,
      decimalsOut
    ),
    getQuoteAerodrome(
      publicClient,
      tokenAddress,
      amountEth,
      decimalsOut,
      false
    ), // volatile
    getQuoteAerodrome(publicClient, tokenAddress, amountEth, decimalsOut, true), // stable
    getQuoteApeStoreBuy(publicClient, tokenAddress, amountEth, decimalsOut),
    getZoraMultiHopQuoteBuy(publicClient, tokenAddress, amountEth, decimalsOut), // Zora multi-hop
    getVirtualTokenQuoteBuy(publicClient, tokenAddress, amountEth, decimalsOut), // VirtualToken
    getQuoteUniswapV4Buy(publicClient, tokenAddress, amountEth, decimalsOut), // UniswapV4
  ]);

  const quotes = [
    v2Quote,
    v3Quote,
    aeroVolatile,
    aeroStable,
    apeStoreQuote,
    zoraMultiHop,
    virtualTokenQuote,
    v4Quote,
  ].filter(Boolean) as DexQuoteResultBuy[];

  if (quotes.length === 0) {
    logger.error(`No liquidity found on any DEX for token ${tokenOut}`);
    throw new Error(
      "No liquidity found on UniswapV2, V3, Aerodrome, Zora, VirtualToken or Apestore Pools"
    );
  }

  // Priorizar V4: Si V4 tiene quote, usarlo como best
  let best = quotes[0];
  if (v4Quote) {
    best = v4Quote;
    logger.info(`🏆 V4 PRIORITY: Using UniswapV4 as best option`);
  } else {
    // Si no hay V4, usar la lógica normal de mejor precio
    for (const q of quotes) {
      if (BigInt(q.amountOut) > BigInt(best.amountOut)) {
        best = q;
      }
    }
  }

  logger.info(`\n=== BUY RESULTS SUMMARY ===`);
  if (v4Quote) {
    logger.info(
      `🏆 BEST: ${best.dexName} - ${best.formattedOut} tokens (V4 PRIORITY)`
    );
  } else {
    logger.info(`🏆 BEST: ${best.dexName} - ${best.formattedOut} tokens`);
  }
  logger.info(`📊 All Quotes:`);
  logger.info(`  • UniswapV2: ${v2Quote?.formattedOut || "N/A"}`);
  logger.info(
    `  • UniswapV3: ${v3Quote?.formattedOut || "N/A"} ${
      v3Quote ? `(fee: ${v3Quote.feeTier})` : ""
    }`
  );
  logger.info(`  • AerodromeVolatile: ${aeroVolatile?.formattedOut || "N/A"}`);
  logger.info(`  • AerodromeStable: ${aeroStable?.formattedOut || "N/A"}`);
  logger.info(`  • ApeStore: ${apeStoreQuote?.formattedOut || "N/A"}`);
  logger.info(
    `  • ZoraMultiHop: ${zoraMultiHop?.formattedOut || "N/A"} ${
      zoraMultiHop ? `(fees: ${zoraMultiHop.fees?.join(",")})` : ""
    }`
  );
  logger.info(`  • VirtualToken: ${virtualTokenQuote?.formattedOut || "N/A"}`);
  logger.info(
    `  • UniswapV4: ${v4Quote?.formattedOut || "N/A"} ${
      v4Quote ? "⭐ PRIORITY" : ""
    }`
  );
  logger.info(`===========================\n`);

  return {
    best,
    v2: v2Quote,
    v3: v3Quote,
    aeroVolatile,
    aeroStable,
    zoraMultiHop,
    virtualToken: virtualTokenQuote,
    v4: v4Quote,
  };
}
