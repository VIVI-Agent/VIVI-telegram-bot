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
import { V4_QUOTER_ABI } from "../swap/v4/quoter";
import {
  V4_POOL_VARIANTS,
  V4_QUOTER_ADDRESS,
  STATE_VIEW_ADDRESS,
} from "../swap/v4/constants";
import { generateVariantPoolKey, calculatePoolId } from "../swap/v4/poolKey";
import { STATE_VIEW_ABI } from "../swap/v4/stateView";

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

// V4 is handled inline via multicall above

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

  // Build multicall batch for all non-V4 quotes
  const calls: any[] = [];
  const callMeta: Array<
    | { type: "v2" }
    | { type: "v3"; fee: number }
    | { type: "aero"; stable: boolean }
    | { type: "ape" }
    | { type: "zora"; path: string }
    | { type: "virtual" }
    | { type: "v4_state"; name: string; poolId: string }
    | {
        type: "v4_quote";
        name: string;
        poolId: string;
        isTokenCurrency0: boolean;
        poolKey: any;
      }
  > = [];

  // V2 TOKEN -> ETH
  calls.push({
    address: contracts.UNISWAPV2_ROUTER as Address,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountTokenIn, [tokenAddress, contracts.ETH as Address]],
  });
  callMeta.push({ type: "v2" });

  // V3 single-hop across fee tiers TOKEN -> ETH
  for (const fee of feeTiers) {
    calls.push({
      address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
      abi: uniswapV3QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: tokenAddress,
          tokenOut: contracts.ETH as Address,
          fee,
          amountIn: amountTokenIn,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    callMeta.push({ type: "v3", fee });
  }

  // Aerodrome volatile/stable TOKEN -> WETH
  const AERO_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;
  const AERO_VOL_FACTORY =
    "0x420dd381b31aef6683db6b902084cb0ffece40da" as Address;
  const AERO_STABLE_FACTORY =
    "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address;
  calls.push({
    address: AERO_ROUTER,
    abi: aerodromeRouterAbi,
    functionName: "getAmountsOut",
    args: [
      amountTokenIn,
      [
        {
          from: tokenAddress,
          to: contracts.ETH as Address,
          stable: false,
          factory: AERO_VOL_FACTORY,
        },
      ],
    ],
  });
  callMeta.push({ type: "aero", stable: false });
  calls.push({
    address: AERO_ROUTER,
    abi: aerodromeRouterAbi,
    functionName: "getAmountsOut",
    args: [
      amountTokenIn,
      [
        {
          from: tokenAddress,
          to: contracts.ETH as Address,
          stable: true,
          factory: AERO_STABLE_FACTORY,
        },
      ],
    ],
  });
  callMeta.push({ type: "aero", stable: true });

  // ApeStore sellQuote
  calls.push({
    address: contracts.APESTORE_ROUTER_ADDRESS as Address,
    abi: apeStoreRouterAbi,
    functionName: "sellQuote",
    args: [tokenAddress, amountTokenIn],
  });
  callMeta.push({ type: "ape" });

  // VirtualToken TOKEN -> VIRTUAL -> ETH (V2 path)
  const VIRTUAL_TOKEN = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b" as Address;
  calls.push({
    address: contracts.UNISWAPV2_ROUTER as Address,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [
      amountTokenIn,
      [tokenAddress, VIRTUAL_TOKEN, contracts.ETH as Address],
    ],
  });
  callMeta.push({ type: "virtual" });

  // V4 variants: add existence check and quoter call per variant
  for (const variant of V4_POOL_VARIANTS) {
    const { poolKey, isTokenCurrency0 } = generateVariantPoolKey(
      tokenAddress,
      variant
    );
    const poolId = calculatePoolId(poolKey);
    // Existence check (optional)
    calls.push({
      address: STATE_VIEW_ADDRESS as Address,
      abi: STATE_VIEW_ABI,
      functionName: "getSlot0",
      args: [poolId as Address],
    });
    callMeta.push({ type: "v4_state", name: variant.name, poolId });

    const zeroForOne = isTokenCurrency0; // sell: TOKEN -> ETH
    const quoteParams = {
      poolKey: {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      zeroForOne,
      exactAmount: amountTokenIn,
      hookData: "0x" as `0x${string}`,
    } as const;
    calls.push({
      address: V4_QUOTER_ADDRESS as Address,
      abi: V4_QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [quoteParams],
    });
    callMeta.push({
      type: "v4_quote",
      name: variant.name,
      poolId,
      isTokenCurrency0,
      poolKey,
    });
  }

  // Zora multi-hop TOKEN -> ZORA -> USDC -> ETH
  const fee1 = 10000; // TOKEN → ZORA
  const fee2 = 3000; // ZORA → USDC
  const fee3 = 500; // USDC → ETH
  const zoraPath = `0x${[
    tokenAddress.slice(2),
    fee1.toString(16).padStart(6, "0"),
    (contracts.ZORA_TOKEN_ADDRESS as Address).slice(2),
    fee2.toString(16).padStart(6, "0"),
    (contracts.USDC_TOKEN_ADDRESS as Address).slice(2),
    fee3.toString(16).padStart(6, "0"),
    (contracts.ETH as Address).slice(2),
  ].join("")}`;
  calls.push({
    address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
    abi: uniswapV3QuoterAbi,
    functionName: "quoteExactInput",
    args: [zoraPath as unknown as Address, amountTokenIn],
  });
  callMeta.push({ type: "zora", path: zoraPath });

  // Execute multicall
  const MULTICALL3_BASE =
    "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
  const multiResults: any[] = (await publicClient.multicall({
    contracts: calls,
    allowFailure: true,
    multicallAddress: MULTICALL3_BASE,
  })) as any[];

  const parsedQuotes: DexQuoteResultSell[] = [];
  let bestV3Out = 0n;
  let bestV3Tier = 0;
  const v4Parsed: DexQuoteResultSell[] = [];

  for (let i = 0; i < multiResults.length; i++) {
    const meta = callMeta[i] as any;
    const res = multiResults[i];
    if (!res || res.status === "failure") continue;
    const value = res.result as any;

    if (meta.type === "v2") {
      const amounts = value as bigint[];
      const out = amounts[amounts.length - 1];
      parsedQuotes.push({
        dexName: "UniswapV2",
        amountOut: out.toString(),
        formattedOut: formatUnits(out, decimalsOut),
        feeTier: 3000,
      });
    } else if (meta.type === "v3") {
      const tuple = value as [bigint, bigint, number, bigint];
      const amountOut = tuple[0];
      if (amountOut > bestV3Out) {
        bestV3Out = amountOut;
        bestV3Tier = meta.fee as number;
      }
    } else if (meta.type === "aero") {
      const amounts = value as bigint[];
      const out = amounts[amounts.length - 1];
      parsedQuotes.push({
        dexName: meta.stable ? "AerodromeStable" : "AerodromeVolatile",
        amountOut: out.toString(),
        formattedOut: formatUnits(out, decimalsOut),
        feeTier: meta.stable ? 500 : 3000,
      });
    } else if (meta.type === "ape") {
      const out = value as bigint;
      parsedQuotes.push({
        dexName: "ApeStore",
        amountOut: out.toString(),
        formattedOut: formatUnits(out, decimalsOut),
        feeTier: 0,
      });
    } else if (meta.type === "virtual") {
      const amounts = value as bigint[];
      const out = amounts[amounts.length - 1];
      parsedQuotes.push({
        dexName: "VirtualToken",
        amountOut: out.toString(),
        formattedOut: formatUnits(out, decimalsOut),
        feeTier: 3000,
        path: [tokenAddress, VIRTUAL_TOKEN, contracts.ETH].join(" → "),
      });
    } else if (meta.type === "zora") {
      const tuple = value as [bigint, bigint[], number[], bigint];
      const amountOut = tuple[0];
      parsedQuotes.push({
        dexName: "ZoraMultiHop",
        amountOut: amountOut.toString(),
        formattedOut: formatUnits(amountOut, decimalsOut),
        feeTier: fee1,
        path: meta.path,
        fees: [fee1, fee2, fee3],
      });
    } else if (meta.type === "v4_state") {
      // optional existence check
    } else if (meta.type === "v4_quote") {
      const [amountOut] = value as [bigint, bigint];
      v4Parsed.push({
        dexName: "UniswapV4",
        amountOut: amountOut.toString(),
        formattedOut: formatUnits(amountOut, decimalsOut),
        feeTier: meta.poolKey.fee,
        poolKey: meta.poolKey,
        poolId: meta.poolId,
      });
    }
  }

  // Add best V3 if found
  if (bestV3Out > 0n) {
    parsedQuotes.push({
      dexName: "UniswapV3",
      amountOut: bestV3Out.toString(),
      formattedOut: formatUnits(bestV3Out, decimalsOut),
      feeTier: bestV3Tier,
    });
  }

  const quotes = [...parsedQuotes, ...v4Parsed] as DexQuoteResultSell[];
  let v4Quote: DexQuoteResultSell | undefined = undefined;
  for (const q of v4Parsed) {
    if (!v4Quote || BigInt(q.amountOut) > BigInt(v4Quote.amountOut)) {
      v4Quote = q;
    }
  }

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
  const findByName = (name: string) =>
    quotes.find((q) => q.dexName === name) as DexQuoteResultSell | undefined;
  logger.info(`📊 All Quotes:`);
  logger.info(
    `  • UniswapV2: ${findByName("UniswapV2")?.formattedOut || "N/A"}`
  );
  const v3Best = findByName("UniswapV3");
  logger.info(
    `  • UniswapV3: ${v3Best?.formattedOut || "N/A"} ${
      v3Best ? `(fee: ${v3Best.feeTier})` : ""
    }`
  );
  logger.info(
    `  • AerodromeVolatile: ${
      findByName("AerodromeVolatile")?.formattedOut || "N/A"
    }`
  );
  logger.info(
    `  • AerodromeStable: ${
      findByName("AerodromeStable")?.formattedOut || "N/A"
    }`
  );
  logger.info(`  • ApeStore: ${findByName("ApeStore")?.formattedOut || "N/A"}`);
  logger.info(
    `  • VirtualToken: ${findByName("VirtualToken")?.formattedOut || "N/A"}`
  );
  const zora = findByName("ZoraMultiHop");
  logger.info(
    `  • ZoraMultiHop: ${zora?.formattedOut || "N/A"} ${
      zora && zora.fees ? `(fees: ${zora.fees.join(",")})` : ""
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
    v2: findByName("UniswapV2"),
    v3: findByName("UniswapV3"),
    aeroVolatile: findByName("AerodromeVolatile"),
    aeroStable: findByName("AerodromeStable"),
    apeStore: findByName("ApeStore"),
    virtualToken: findByName("VirtualToken"),
    zoraMultiHop: findByName("ZoraMultiHop"),
    v4: v4Quote,
  };
}
