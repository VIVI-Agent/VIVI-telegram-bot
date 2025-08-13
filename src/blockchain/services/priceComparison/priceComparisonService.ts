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
import { V4_QUOTER_ABI } from "../swap/v4/quoter";
import {
  V4_POOL_VARIANTS,
  V4_QUOTER_ADDRESS,
  STATE_VIEW_ADDRESS,
} from "../swap/v4/constants";
import { generateVariantPoolKey, calculatePoolId } from "../swap/v4/poolKey";
import { STATE_VIEW_ABI } from "../swap/v4/stateView";

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

// V4 is handled inline via multicall above

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
  // Build multicall batch for all quotes (including V4)
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

  // V2
  calls.push({
    address: contracts.UNISWAPV2_ROUTER as Address,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountEth, [contracts.ETH as Address, tokenAddress]],
  });
  callMeta.push({ type: "v2" });

  // V3 across fee tiers
  for (const fee of feeTiers) {
    calls.push({
      address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
      abi: uniswapV3QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: contracts.ETH as Address,
          tokenOut: tokenAddress,
          fee,
          amountIn: amountEth,
          sqrtPriceLimitX96: 0,
        },
      ],
    });
    callMeta.push({ type: "v3", fee });
  }

  // Aerodrome volatile/stable
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
      amountEth,
      [
        {
          from: contracts.ETH as Address,
          to: tokenAddress,
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
      amountEth,
      [
        {
          from: contracts.ETH as Address,
          to: tokenAddress,
          stable: true,
          factory: AERO_STABLE_FACTORY,
        },
      ],
    ],
  });
  callMeta.push({ type: "aero", stable: true });

  // ApeStore
  calls.push({
    address: contracts.APESTORE_ROUTER_ADDRESS as Address,
    abi: apeStoreRouterAbi,
    functionName: "buyQuote",
    args: [tokenAddress, amountEth],
  });
  callMeta.push({ type: "ape" });

  // Zora MultiHop (ETH→USDC→ZORA→TOKEN)
  const fee1 = 500;
  const fee2 = 3000;
  const fee3 = 10000;
  const zoraPath = `0x${[
    (contracts.ETH as Address).slice(2),
    fee1.toString(16).padStart(6, "0"),
    (contracts.USDC_TOKEN_ADDRESS as Address).slice(2),
    fee2.toString(16).padStart(6, "0"),
    (contracts.ZORA_TOKEN_ADDRESS as Address).slice(2),
    fee3.toString(16).padStart(6, "0"),
    tokenAddress.slice(2),
  ].join("")}`;
  calls.push({
    address: contracts.UNISWAP_V3_QUOTER_ADDRESS as Address,
    abi: uniswapV3QuoterAbi,
    functionName: "quoteExactInput",
    args: [zoraPath as unknown as Address, amountEth],
  });
  callMeta.push({ type: "zora", path: zoraPath });

  // VirtualToken (ETH→VIRTUAL→TOKEN) via V2
  const VIRTUAL_TOKEN_ADDRESS =
    "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b" as Address;
  calls.push({
    address: contracts.UNISWAPV2_ROUTER as Address,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [
      amountEth,
      [contracts.ETH as Address, VIRTUAL_TOKEN_ADDRESS, tokenAddress],
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

    const zeroForOne = !isTokenCurrency0; // buy: ETH -> TOKEN
    const quoteParams = {
      poolKey: {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      zeroForOne,
      exactAmount: amountEth,
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

  // Execute multicall for all above
  const MULTICALL3_BASE =
    "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
  const multiResults: any[] = (await publicClient.multicall({
    contracts: calls,
    allowFailure: true,
    multicallAddress: MULTICALL3_BASE,
  })) as any[];

  // Parse results into DexQuoteResultBuy[]
  const parsedQuotes: DexQuoteResultBuy[] = [];
  let bestV3Out = 0n;
  let bestV3Tier = 0;
  const v4Parsed: DexQuoteResultBuy[] = [];

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
        feeTier: 3000,
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
    } else if (meta.type === "virtual") {
      const amounts = value as bigint[];
      const out = amounts[amounts.length - 1];
      parsedQuotes.push({
        dexName: "VirtualToken",
        amountOut: out.toString(),
        formattedOut: formatUnits(out, decimalsOut),
        feeTier: 3000,
        path: [contracts.ETH, VIRTUAL_TOKEN_ADDRESS, tokenAddress].join("→"),
      });
    } else if (meta.type === "v4_state") {
      // optional existence check result; ignore here
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

  // Merge all quotes
  const quotes = [...parsedQuotes, ...v4Parsed] as DexQuoteResultBuy[];
  // Pick best V4 (if any) for reporting/priority
  let v4Quote: DexQuoteResultBuy | undefined = undefined;
  for (const q of v4Parsed) {
    if (!v4Quote || BigInt(q.amountOut) > BigInt(v4Quote.amountOut)) {
      v4Quote = q;
    }
  }

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

  // Build helper accessors from parsed quotes
  const findByName = (name: string) =>
    quotes.find((q) => q.dexName === name) as DexQuoteResultBuy | undefined;

  logger.info(`\n=== BUY RESULTS SUMMARY ===`);
  if (v4Quote) {
    logger.info(
      `🏆 BEST: ${best.dexName} - ${best.formattedOut} tokens (V4 PRIORITY)`
    );
  } else {
    logger.info(`🏆 BEST: ${best.dexName} - ${best.formattedOut} tokens`);
  }
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
  const zora = findByName("ZoraMultiHop");
  logger.info(
    `  • ZoraMultiHop: ${zora?.formattedOut || "N/A"} ${
      zora && zora.fees ? `(fees: ${zora.fees.join(",")})` : ""
    }`
  );
  logger.info(
    `  • VirtualToken: ${findByName("VirtualToken")?.formattedOut || "N/A"}`
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
    zoraMultiHop: findByName("ZoraMultiHop"),
    virtualToken: findByName("VirtualToken"),
    v4: v4Quote,
  };
}
