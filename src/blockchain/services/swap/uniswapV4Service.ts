// src/blockchain/services/swap/uniswapV4Service.ts

import {
  Address,
  createPublicClient,
  formatUnits,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { logger } from "@logger";

// Constantes para Uniswap V4
const STATE_VIEW_ADDRESS = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71"; // Base mainnet
const V4_QUOTER_ADDRESS = "0x0d5e0f971ed27fbff6c2837bf31316121532048d"; // Base V4Quoter
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const HOOK_ADDRESS = "0x9ea932730A7787000042e34390B8E435dD839040";
const FEE = 30000;
const TICK_SPACING = 200;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface V4PoolInfo {
  poolKey: PoolKey;
  poolId: string;
  exists: boolean;
  isTokenCurrency0: boolean; // true si el token es currency0, false si es currency1
}

/**
 * Genera las dos posibles combinaciones de PoolKey para un token
 */
function generatePoolKeys(tokenAddress: Address): PoolKey[] {
  const weth = WETH_ADDRESS as Address;
  const token = tokenAddress.toLowerCase() as Address;

  return [
    // Caso 1: WETH como currency0, TOKEN como currency1
    {
      currency0: weth,
      currency1: token,
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: HOOK_ADDRESS as Address,
    },
    // Caso 2: TOKEN como currency0, WETH como currency1
    {
      currency0: token,
      currency1: weth,
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: HOOK_ADDRESS as Address,
    },
  ];
}

/**
 * Calcula el Pool ID para un PoolKey usando viem
 */
function calculatePoolId(poolKey: PoolKey): string {
  const encoded = encodeAbiParameters(
    [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
    [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
    ]
  );
  return keccak256(encoded);
}

/**
 * ABI para StateView getSlot0
 */
const STATE_VIEW_ABI = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

/**
 * ABI para V4Quoter
 */
const V4_QUOTER_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/**
 * Verifica si un pool existe usando StateView con viem
 */
async function checkPoolExists(
  publicClient: ReturnType<typeof createPublicClient>,
  poolId: string
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: STATE_VIEW_ADDRESS as Address,
      abi: STATE_VIEW_ABI,
      functionName: "getSlot0",
      args: [poolId as `0x${string}`],
    });

    // Si getSlot0 retorna datos válidos, el pool existe
    return result && result[0] > 0n; // sqrtPriceX96 > 0 indica pool inicializado
  } catch (error) {
    // Si falla la llamada, el pool no existe
    return false;
  }
}

/**
 * Obtiene quote del V4Quoter
 */
async function getV4Quote(
  publicClient: ReturnType<typeof createPublicClient>,
  poolKey: PoolKey,
  zeroForOne: boolean,
  exactAmount: bigint
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const quoteParams = {
      poolKey: {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      zeroForOne,
      exactAmount,
      hookData: "0x" as `0x${string}`,
    };

    const result = await publicClient.simulateContract({
      address: V4_QUOTER_ADDRESS as Address,
      abi: V4_QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [quoteParams],
    });

    const [amountOut, gasEstimate] = result.result;
    return { amountOut, gasEstimate };
  } catch (error) {
    logger.error(`Error getting V4 quote: ${error}`);
    return null;
  }
}

/**
 * Busca pools válidos para un token
 */
export async function findV4Pools(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address
): Promise<V4PoolInfo[]> {
  const poolKeys = generatePoolKeys(tokenAddress);
  const poolInfos: V4PoolInfo[] = [];

  for (let i = 0; i < poolKeys.length; i++) {
    const poolKey = poolKeys[i];
    const poolId = calculatePoolId(poolKey);
    const exists = await checkPoolExists(publicClient, poolId);

    if (exists) {
      poolInfos.push({
        poolKey,
        poolId,
        exists: true,
        isTokenCurrency0: i === 1, // true para el segundo caso (TOKEN como currency0)
      });

      logger.info(
        `V4 Pool found: ${poolId} (${poolKey.currency0} / ${poolKey.currency1})`
      );
    }
  }

  return poolInfos;
}

/**
 * Verifica si V4 tiene liquidez disponible para un token
 */
export async function hasV4Liquidity(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address
): Promise<boolean> {
  try {
    const pools = await findV4Pools(publicClient, tokenAddress);
    return pools.length > 0;
  } catch (error) {
    logger.error(`Error checking V4 liquidity: ${error}`);
    return false;
  }
}

/**
 * Interface para el resultado de quote V4
 */
export interface V4QuoteResult {
  dexName: string;
  amountOut: string;
  formattedOut: string;
  feeTier: number;
  poolKey: PoolKey;
  poolId: string;
  gasEstimate?: string;
}

/**
 * Hace quote para compra (ETH → Token) en Uniswap V4
 */
export async function getV4QuoteBuy(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address,
  amountEthIn: bigint,
  decimalsOut: number
): Promise<V4QuoteResult | null> {
  try {
    const pools = await findV4Pools(publicClient, tokenAddress);

    if (pools.length === 0) {
      logger.warn(`No V4 pools found for token ${tokenAddress}`);
      return null;
    }

    // Para compra, buscamos pool donde WETH es currency0 y TOKEN es currency1
    const buyPool = pools.find((pool) => !pool.isTokenCurrency0);

    if (!buyPool) {
      logger.warn(`No suitable V4 buy pool found for token ${tokenAddress}`);
      return null;
    }

    // Obtener quote real
    const quote = await getV4Quote(
      publicClient,
      buyPool.poolKey,
      true, // zeroForOne = true (WETH → TOKEN)
      amountEthIn
    );

    if (!quote) {
      logger.warn(`Failed to get V4 buy quote for token ${tokenAddress}`);
      return null;
    }

    const result: V4QuoteResult = {
      dexName: "UniswapV4",
      amountOut: quote.amountOut.toString(),
      formattedOut: formatUnits(quote.amountOut, decimalsOut),
      feeTier: FEE,
      poolKey: buyPool.poolKey,
      poolId: buyPool.poolId,
      gasEstimate: quote.gasEstimate.toString(),
    };

    logger.info(
      `V4 BUY quote: ${result.formattedOut} tokens for ${formatUnits(
        amountEthIn,
        18
      )} ETH`
    );
    return result;
  } catch (error) {
    logger.error(`Error getting V4 buy quote: ${error}`);
    return null;
  }
}

/**
 * Hace quote para venta (Token → ETH) en Uniswap V4
 */
export async function getV4QuoteSell(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address,
  amountTokenIn: bigint,
  decimalsIn: number = 18, // Decimales del token de entrada
  decimalsOut: number = 18
): Promise<V4QuoteResult | null> {
  try {
    const pools = await findV4Pools(publicClient, tokenAddress);

    if (pools.length === 0) {
      logger.warn(`No V4 pools found for token ${tokenAddress}`);
      return null;
    }

    // Para venta, necesitamos determinar el pool correcto y la dirección
    // Intentamos con cada pool hasta encontrar uno que funcione
    for (const pool of pools) {
      try {
        // Determinar zeroForOne basado en la estructura del pool
        let zeroForOne: boolean;
        let poolKeyToUse = pool.poolKey;

        if (pool.isTokenCurrency0) {
          // TOKEN es currency0, WETH es currency1 → TOKEN → WETH (zeroForOne = true)
          zeroForOne = true;
        } else {
          // WETH es currency0, TOKEN es currency1 → TOKEN → WETH (zeroForOne = false)
          zeroForOne = false;
        }

        const quote = await getV4Quote(
          publicClient,
          poolKeyToUse,
          zeroForOne,
          amountTokenIn
        );

        if (quote) {
          const result: V4QuoteResult = {
            dexName: "UniswapV4",
            amountOut: quote.amountOut.toString(),
            formattedOut: formatUnits(quote.amountOut, decimalsOut),
            feeTier: FEE,
            poolKey: poolKeyToUse,
            poolId: pool.poolId,
            gasEstimate: quote.gasEstimate.toString(),
          };

          logger.info(
            `V4 SELL quote: ${result.formattedOut} ETH for ${formatUnits(
              amountTokenIn,
              decimalsIn
            )} tokens`
          );
          return result;
        }
      } catch (error) {
        // Continuar con el siguiente pool si este falla
        continue;
      }
    }

    logger.warn(`No valid V4 sell quote found for token ${tokenAddress}`);
    return null;
  } catch (error) {
    logger.error(`Error getting V4 sell quote: ${error}`);
    return null;
  }
}
