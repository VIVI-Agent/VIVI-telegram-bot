import { Address } from "viem";

/**
 * Unified pool selection logic for both initial load and refresh
 * This function selects the best pool based on the DEX name and token address
 */
export function selectBestPool(pools: any, dexName: string, tokenAddress: Address): any | undefined {
  const WETH = "0x4200000000000000000000000000000000000006".toLowerCase();
  const ZORA = "0x1111111111166b7FE7bd91427724B487980aFc69".toLowerCase();
  const VIRTUAL = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b".toLowerCase();

  const tokenLower = tokenAddress.toLowerCase();
  const poolsArray: any[] = Array.isArray(pools) ? pools : [];
  const poolsSortedByLiquidity = [...poolsArray].sort(
    (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
  );
  const hasLabel = (pool: any, label: string) =>
    Array.isArray(pool.labels) &&
    pool.labels.some((l: string) => l?.toLowerCase() === label.toLowerCase());

  let chosenPool: any | undefined;

  if (dexName === "UniswapV2") {
    chosenPool = poolsSortedByLiquidity.find(
      (p) =>
        (p.dexId?.toLowerCase() === "uniswap" || p.dexId?.toLowerCase().includes("uniswap")) &&
        (hasLabel(p, "v2") || hasLabel(p, "V2") || p.labels?.includes("v2"))
    );
  } else if (dexName === "UniswapV3") {
    chosenPool = poolsSortedByLiquidity.find(
      (p) =>
        (p.dexId?.toLowerCase() === "uniswap" || p.dexId?.toLowerCase().includes("uniswap")) &&
        (hasLabel(p, "v3") || hasLabel(p, "V3") || p.labels?.includes("v3"))
    );
  } else if (dexName?.startsWith("Aerodrome")) {
    chosenPool = poolsSortedByLiquidity.find((p) =>
      p.dexId?.toLowerCase().includes("aerodrome")
    );
  } else if (dexName === "VirtualToken") {
    chosenPool = poolsSortedByLiquidity.find(
      (p) =>
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(
          tokenLower
        ) &&
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(VIRTUAL)
    );
  } else if (dexName === "ZoraMultiHop") {
    chosenPool = poolsSortedByLiquidity.find(
      (p) =>
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(
          tokenLower
        ) &&
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(ZORA)
    );
  } else if (dexName === "UniswapV4") {
    chosenPool = poolsSortedByLiquidity.find(
      (p) =>
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(
          tokenLower
        ) &&
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(WETH) &&
        ((p.dexId?.toLowerCase() === "uniswap" || p.dexId?.toLowerCase().includes("uniswap")) &&
          (hasLabel(p, "v4") || hasLabel(p, "V4") || p.labels?.includes("v4")))
    );
  }

  // Fallback: find any pool with the token
  if (!chosenPool) {
    chosenPool = poolsSortedByLiquidity.find(
      (p) =>
        [p.baseToken?.address?.toLowerCase(), p.quoteToken?.address?.toLowerCase()].includes(
          tokenLower
        )
    );
  }

  return chosenPool;
} 