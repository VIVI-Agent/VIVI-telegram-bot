// src/services/swap/priceComparisonServiceSell.ts

import { createPublicClient, formatUnits, Address } from "viem";
import {
  uniswapV2RouterAbi,
  uniswapV3QuoterAbi,
  aerodromeRouterAbi,
  apeStoreRouterAbi,
} from "@abis";
import { contracts } from "@config";
import { logger } from "@logger";
import { getV4QuoteSell } from "../swap/v4/quoter";

const ONLYSUMMARY = true;

export interface DexQuoteResultSell {
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
 * 1) UniswapV2
 */
async function getQuoteUniswapV2Sell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  amountIn: bigint,
  decimalsOut: number // 18 para WETH
): Promise<DexQuoteResultSell | null> {
  try {
    const path: Address[] = [tokenIn, contracts.ETH as Address];

    const amounts = (await publicClient.readContract({
      address: contracts.UNISWAPV2_ROUTER as Address,
      abi: uniswapV2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    })) as bigint[];

    const out = amounts[1];
    const result = {
      dexName: "UniswapV2",
      amountOut: out.toString(),
      formattedOut: formatUnits(out, decimalsOut),
      feeTier: 3000,
    };

    if (!ONLYSUMMARY) {
      logger.info(
        `UniswapV2 SELL Quote: ${result.formattedOut} ETH for ${formatUnits(
          amountIn,
          18
        )} tokens`
      );
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(
        `UniswapV2 SELL failed - No pool available for token ${tokenIn}`
      );
    }
    return null;
  }
}

/**
 * 2) UniswapV3
 */
async function getBestQuoteUniswapV3Sell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  feeTiers: number[],
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultSell | null> {
  let bestAmountOut = 0n;
  let bestTier = 0;

  if (!ONLYSUMMARY) {
    logger.info(`UniswapV3 SELL - Testing fee tiers: [${feeTiers.join(", ")}]`);
  }

  for (const feeTier of feeTiers) {
    try {
      const result = await publicClient.readContract({
        address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
        abi: uniswapV3QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut: contracts.ETH as Address,
            fee: feeTier,
            amountIn,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const [amountOut] = result as [bigint, bigint, number, bigint];

      if (!ONLYSUMMARY) {
        logger.info(
          `  └─ Fee ${feeTier}: ${formatUnits(amountOut, decimalsOut)} ETH`
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
      logger.error(`UniswapV3 SELL - No pools found for any fee tier`);
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
      `UniswapV3 SELL Best Quote: ${result.formattedOut} ETH (fee: ${bestTier})`
    );
  }
  return result;
}

/**
 * 3) Aerodrome
 */
async function getQuoteAerodromeSell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  amountIn: bigint,
  decimalsOut: number,
  stable: boolean
): Promise<DexQuoteResultSell | null> {
  const poolType = stable ? "Stable" : "Volatile";

  try {
    const WETH = contracts.ETH as Address;
    const router = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;

    const factory = stable
      ? ("0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address)
      : ("0x420dd381b31aef6683db6b902084cb0ffece40da" as Address);

    const routes = [
      {
        from: tokenIn,
        to: WETH,
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
        logger.error(`Aerodrome${poolType} SELL - Zero output amount`);
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
        `Aerodrome${poolType} SELL Quote: ${result.formattedOut} ETH`
      );
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`Aerodrome${poolType} SELL failed - No pool available`);
    }
    return null;
  }
}

async function getQuoteApeStoreSell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  amountIn: bigint
): Promise<DexQuoteResultSell | null> {
  const decimalsOut = 18; // WETH has 18 decimals

  try {
    const amountOut = await publicClient.readContract({
      address: contracts.APESTORE_ROUTER_ADDRESS as Address,
      abi: apeStoreRouterAbi,
      functionName: "sellQuote",
      args: [tokenIn, amountIn],
    });

    const result = {
      dexName: "ApeStore",
      amountOut: amountOut.toString(),
      formattedOut: formatUnits(amountOut, decimalsOut),
      feeTier: 0,
    };

    if (!ONLYSUMMARY) {
      logger.info(`ApeStore SELL Quote: ${result.formattedOut} ETH`);
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`ApeStore SELL failed - ${err}`);
    }
    return null;
  }
}

/**
 * 4) VirtualToken Multi-hop: TOKEN → VIRTUAL → ETH
 */
async function getVirtualTokenQuoteSell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultSell | null> {
  logger.info(`VirtualToken SELL - Path: TOKEN → VIRTUAL → ETH`);

  // VirtualToken path: TOKEN → VIRTUAL → ETH
  // Using UniswapV2 routing similar to buy function
  const VIRTUAL_TOKEN = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b" as Address;

  try {
    const path: Address[] = [tokenIn, VIRTUAL_TOKEN, contracts.ETH as Address];

    const amounts = (await publicClient.readContract({
      address: contracts.UNISWAPV2_ROUTER as Address,
      abi: uniswapV2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    })) as bigint[];

    const out = amounts[2]; // Final ETH amount
    const result = {
      dexName: "VirtualToken",
      amountOut: out.toString(),
      formattedOut: formatUnits(out, decimalsOut),
      feeTier: 3000, // Standard fee tier for display
      path: path.join(" → "),
    };

    if (!ONLYSUMMARY) {
      logger.info(`VirtualToken SELL Quote: ${result.formattedOut} ETH`);
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`VirtualToken SELL failed - No pool available`);
    }
    return null;
  }
}

/**
 * 5) Zora Multi-hop: TOKEN → ZORA → USDC → ETH
 */
async function getZoraMultiHopQuoteSell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  amountIn: bigint,
  decimalsOut: number
): Promise<DexQuoteResultSell | null> {
  // Fijas las fees específicas para cada salto (en orden inverso a la compra):
  // TOKEN → ZORA: 10000 (1%)
  // ZORA → USDC: 3000 (0.3%)
  // USDC → ETH: 500 (0.05%)
  const fee1 = 10000; // TOKEN → ZORA
  const fee2 = 3000; // ZORA → USDC
  const fee3 = 500; // USDC → ETH
  const fees = [fee1, fee2, fee3];

  logger.info(
    `ZoraMultiHop SELL - Path: TOKEN → ZORA (${fee1}) → USDC (${fee2}) → ETH (${fee3})`
  );

  try {
    // Construir el path para exactInput multi-hop
    // Path format: tokenA + fee + tokenB + fee + tokenC + fee + tokenD
    const path = `0x${[
      tokenIn.slice(2), // Remove 0x prefix
      fee1.toString(16).padStart(6, "0"), // fee as 3 bytes hex
      contracts.ZORA_TOKEN_ADDRESS.slice(2),
      fee2.toString(16).padStart(6, "0"),
      contracts.USDC_TOKEN_ADDRESS.slice(2),
      fee3.toString(16).padStart(6, "0"),
      contracts.ETH.slice(2),
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

    logger.info(
      `ZoraMultiHop SELL Quote: ${
        quoteResult.formattedOut
      } ETH (fees: ${fees.join(",")})`
    );
    return quoteResult;
  } catch (err) {
    logger.error(
      `ZoraMultiHop SELL failed - fees=[${fees.join(",")}] - ${err}`
    );
    return null;
  }
}

/**
 * 6) UniswapV4
 */
async function getQuoteUniswapV4Sell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenIn: Address,
  amountIn: bigint,
  decimalsIn: number, // Decimales del token de entrada
  decimalsOut: number
): Promise<DexQuoteResultSell | null> {
  try {
    const v4Result = await getV4QuoteSell(
      publicClient,
      tokenIn,
      amountIn,
      decimalsIn,
      decimalsOut
    );

    if (!v4Result) {
      if (!ONLYSUMMARY) {
        logger.error(
          `UniswapV4 SELL failed - No pools found for token ${tokenIn}`
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
        `UniswapV4 SELL Quote: ${result.formattedOut} ETH for ${formatUnits(
          amountIn,
          decimalsIn
        )} tokens (Pool: ${v4Result.poolId})`
      );
    }
    return result;
  } catch (err) {
    if (!ONLYSUMMARY) {
      logger.error(`UniswapV4 SELL failed - ${err}`);
    }
    return null;
  }
}

export async function getBestDexForSellTokenToEth({
  publicClient,
  tokenIn,
  feeTiers, // e.g. [100, 500, 3000, 10000]
  amountTokenIn,
  decimalsIn = 18, // Decimales del token de entrada
}: {
  publicClient: ReturnType<typeof createPublicClient>;
  tokenIn: Address;
  feeTiers: number[];
  amountTokenIn: bigint;
  decimalsIn?: number;
}) {
  logger.info(`\n=== SELL COMPARISON START ===`);
  logger.info(`Token: ${tokenIn}`);
  logger.info(`Amount Tokens: ${formatUnits(amountTokenIn, decimalsIn)}`);
  logger.info(`Fee tiers: [${feeTiers.join(", ")}]`);
  logger.info(`==============================`);

  const decimalsOut = 18;
  const tokenAddress = tokenIn.toLowerCase() as Address;

  const [
    v2Quote,
    v3Quote,
    aeroVolatile,
    aeroStable,
    apeStoreQuote,
    virtualTokenQuote,
    zoraMultiHop,
    v4Quote,
  ] = await Promise.all([
    getQuoteUniswapV2Sell(
      publicClient,
      tokenAddress,
      amountTokenIn,
      decimalsOut
    ),
    getBestQuoteUniswapV3Sell(
      publicClient,
      tokenAddress,
      feeTiers,
      amountTokenIn,
      decimalsOut
    ),
    getQuoteAerodromeSell(
      publicClient,
      tokenAddress,
      amountTokenIn,
      decimalsOut,
      false
    ),
    getQuoteAerodromeSell(
      publicClient,
      tokenAddress,
      amountTokenIn,
      decimalsOut,
      true
    ),
    getQuoteApeStoreSell(publicClient, tokenAddress, amountTokenIn),
    getVirtualTokenQuoteSell(
      publicClient,
      tokenAddress,
      amountTokenIn,
      decimalsOut
    ),
    getZoraMultiHopQuoteSell(
      publicClient,
      tokenAddress,
      amountTokenIn,
      decimalsOut
    ),
    getQuoteUniswapV4Sell(
      publicClient,
      tokenAddress,
      amountTokenIn,
      decimalsIn,
      decimalsOut
    ),
  ]);

  const quotes = [
    v2Quote,
    v3Quote,
    aeroVolatile,
    aeroStable,
    apeStoreQuote,
    virtualTokenQuote,
    zoraMultiHop,
    v4Quote,
  ].filter(Boolean) as DexQuoteResultSell[];

  if (quotes.length === 0) {
    logger.error(`No liquidity found on any DEX for token ${tokenIn}`);
    throw new Error(
      "No liquidity found on UniswapV2, V3, Aerodrome, VirtualToken, Zora or Apestore Pools"
    );
  }

  // Priorizar V4: Si V4 tiene quote, usarlo como best
  let best = quotes[0];
  let bestAmountOut = BigInt(quotes[0].amountOut);

  if (v4Quote) {
    best = v4Quote;
    bestAmountOut = BigInt(v4Quote.amountOut);
    logger.info(`🏆 V4 PRIORITY: Using UniswapV4 as best option`);
  } else {
    // Si no hay V4, usar la lógica normal de mejor precio
    for (const q of quotes) {
      const currentOut = BigInt(q.amountOut);
      if (currentOut > bestAmountOut) {
        best = q;
        bestAmountOut = currentOut;
      }
    }
  }

  logger.info(`\n=== SELL RESULTS SUMMARY ===`);
  if (v4Quote) {
    logger.info(
      `🏆 BEST: ${best.dexName} - ${best.formattedOut} ETH (V4 PRIORITY)`
    );
  } else {
    logger.info(`🏆 BEST: ${best.dexName} - ${best.formattedOut} ETH`);
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
  logger.info(`  • VirtualToken: ${virtualTokenQuote?.formattedOut || "N/A"}`);
  logger.info(
    `  • ZoraMultiHop: ${zoraMultiHop?.formattedOut || "N/A"} ${
      zoraMultiHop ? `(fees: ${zoraMultiHop.fees?.join(",")})` : ""
    }`
  );
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
    apeStore: apeStoreQuote,
    virtualToken: virtualTokenQuote,
    zoraMultiHop,
    v4: v4Quote,
  };
}
