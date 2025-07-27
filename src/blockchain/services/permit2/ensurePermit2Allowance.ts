// src/blockchain/services/permit2/ensurePermit2Allowance.ts
import { Address, Hex, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Token, Wallet } from "@prisma/client";
import { findOrCreateToken } from "@blockchain";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

// Constantes para Permit2
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const MAX_PERMIT2_AMOUNT = (2n ** 256n - 1n).toString();
const MAX_PERMIT2_EXPIRATION = "4102444800"; // 31/12/2099 00:00:00 UTC

/**
 * Verifica si un timestamp ha expirado
 */
function isExpired(expiration: string): boolean {
  const expirationTimestamp = BigInt(expiration);
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
  return currentTimestamp >= expirationTimestamp;
}

export interface EnsurePermit2AllowanceParams {
  walletEntity: Wallet;
  tokenAddress: Address;
  requiredAmount: bigint;
  spender: Address; // Dirección de tu contrato VIVIUniswapV4
  privateKey: Hex;
  viviContractAddress: Address; // Dirección del contrato VIVIUniswapV4
}

/**
 * Implementa la lógica de aseguramiento de Permit2 allowance:
 * - Busca o crea el token.
 * - Consulta en DB el permit2 allowance usando el servicio.
 * - Si es insuficiente o ha expirado, llama a tu contrato para aprobar.
 * - Actualiza (o crea) el registro en DB en segundo plano.
 */
export async function ensurePermit2AllowanceLogic(
  ctx: GlobalSceneContext,
  params: EnsurePermit2AllowanceParams
): Promise<void> {
  const start = performance.now();
  const {
    walletEntity,
    tokenAddress,
    requiredAmount,
    spender,
    privateKey,
    viviContractAddress,
  } = params;

  try {
    // Obtener o crear el token
    const token = await findOrCreateToken(ctx, tokenAddress);

    // Buscar el registro de permit2 allowance en DB usando el servicio
    let permit2Record =
      await ctx.services.permit2AllowanceService.findPermit2Allowance(
        walletEntity.id,
        token?.id!,
        spender,
        PERMIT2_ADDRESS
      );

    if (!permit2Record) {
      // No existe registro, necesitamos aprobar
      await approvePermit2ThroughContract(
        viviContractAddress,
        tokenAddress,
        privateKey
      );

      // Crear el registro en DB de forma asíncrona (background)
      setImmediate(async () => {
        try {
          await ctx.services.permit2AllowanceService.createPermit2Allowance({
            walletId: walletEntity.id,
            tokenId: token?.id!,
            spender: spender.toLowerCase(),
            amount: MAX_PERMIT2_AMOUNT,
            expiration: MAX_PERMIT2_EXPIRATION,
            permit2Address: PERMIT2_ADDRESS.toLowerCase(),
          });
          logger.info(
            `Permit2 allowance created for spender ${spender} on token ${tokenAddress} [DB CREATE done in background].`
          );
        } catch (err) {
          logger.error("Background Permit2 DB create failed:", err);
        }
      });
      return;
    }

    // Verificar si ha expirado o es insuficiente
    const dbAmount = BigInt(permit2Record.amount);
    const hasExpired = isExpired(permit2Record.expiration);

    if (dbAmount < requiredAmount || hasExpired) {
      // Necesitamos re-aprobar
      await approvePermit2ThroughContract(
        viviContractAddress,
        tokenAddress,
        privateKey
      );

      setImmediate(async () => {
        try {
          await ctx.services.permit2AllowanceService.updatePermit2Allowance(
            permit2Record.id,
            MAX_PERMIT2_AMOUNT,
            MAX_PERMIT2_EXPIRATION
          );
          logger.info(
            `Permit2 allowance updated for spender ${spender} on token ${tokenAddress} [DB UPDATE in background].`
          );
        } catch (err) {
          logger.error("Background Permit2 DB update failed:", err);
        }
      });
    } else {
      logger.info(
        `Permit2 allowance already sufficient for spender ${spender} on token ${tokenAddress}. No action needed.`
      );
    }

    const end = performance.now();
    logger.info(
      `[ensurePermit2Allowance] took ${(end - start).toFixed(2)} milliseconds`
    );
  } catch (error: any) {
    logger.error(
      `Error in ensurePermit2Allowance for wallet ${walletEntity.address} and token ${tokenAddress}:`,
      error
    );
    throw new Error(
      `Could not ensure Permit2 allowance for spender ${spender} on token ${tokenAddress}`
    );
  }
}

/**
 * ABI mínimo del contrato VIVIUniswapV4
 */
const VIVI_CONTRACT_ABI = [
  {
    name: "approveTokenPermit2",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

/**
 * Aprueba Permit2 llamando a tu contrato VIVIUniswapV4 usando viem
 */
async function approvePermit2ThroughContract(
  viviContractAddress: Address,
  tokenAddress: Address,
  privateKey: Hex
): Promise<void> {
  try {
    // Crear account desde private key
    const account = privateKeyToAccount(privateKey);

    // Crear wallet client
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.RPC_URL),
    }).extend(publicActions);

    // Valores máximos para Permit2
    const maxAmount = 2n ** 160n - 1n; // Máximo para uint160
    const maxExpiration = parseInt(MAX_PERMIT2_EXPIRATION); // Convertir a número

    logger.info(
      `Calling approveTokenPermit2 for token ${tokenAddress} with max values...`
    );

    // Llamar a la función del contrato
    const hash = await walletClient.writeContract({
      address: viviContractAddress,
      abi: VIVI_CONTRACT_ABI,
      functionName: "approveTokenPermit2",
      args: [tokenAddress, maxAmount, maxExpiration],
      gas: 200_000n, // Gas limit conservativo
    });

    // Esperar confirmación
    const receipt = await walletClient.waitForTransactionReceipt({ hash });
    logger.info("Permit2 approve confirmed in block:", receipt.blockNumber);
  } catch (error: any) {
    logger.error("Error calling approveTokenPermit2:", error);
    throw error;
  }
}
