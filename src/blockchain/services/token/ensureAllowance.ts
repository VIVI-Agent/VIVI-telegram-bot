// src/usecases/allowance/ensureAllowance.ts
import { Address, Hex } from "viem";
import { Token, Wallet } from "@prisma/client";
import { findOrCreateToken, getAllowance } from "@blockchain";
import { approveInfinite } from "@blockchain";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

export interface EnsureAllowanceParams {
  walletEntity: Wallet;
  tokenAddress: Address;
  requiredAmount: bigint;
  spender: Address;
  privateKey: Hex;
}

/**
 * Implementa la lógica de aseguramiento de allowance:
 * - Busca o crea el token.
 * - Consulta en DB el allowance usando el servicio.
 * - Si es insuficiente, consulta en cadena y, de ser necesario, aprueba allowance infinito.
 * - Actualiza (o crea) el registro en DB en segundo plano.
 */
export async function ensureAllowanceLogic(
  ctx: GlobalSceneContext,
  params: EnsureAllowanceParams
): Promise<void> {
  const start = performance.now();
  const { walletEntity, tokenAddress, requiredAmount, spender, privateKey } =
    params;

  try {
    // Obtener o crear el token
    const token = await findOrCreateToken(ctx, tokenAddress);

    // Buscar el registro de allowance en DB usando el servicio
    let allowanceRecord = await ctx.services.allowanceService.findAllowance(
      walletEntity.id,
      token?.id!,
      spender
    );

    if (!allowanceRecord) {
      const chainAllowance = await getAllowance(
        tokenAddress,
        walletEntity.address as Hex,
        spender
      );

      if (chainAllowance < requiredAmount) {
        const { waitReceipt } = await approveInfinite(
          tokenAddress,
          spender,
          privateKey
        );
        const receipt = await waitReceipt;
        logger.info("Approve confirmed in block:", receipt.blockNumber);

        // Crear el registro en DB de forma asíncrona (background)
        setImmediate(async () => {
          try {
            await ctx.services.allowanceService.createAllowance({
              walletId: walletEntity.id,
              tokenId: token?.id!,
              spender: spender.toLowerCase(),
              allowance: (2n ** 256n - 1n).toString(), // MaxUint256
            });
            logger.info(
              `Allowance updated to infinite for spender ${spender} on token ${tokenAddress} [DB CREATE done in background].`
            );
          } catch (err) {
            logger.error("Background DB create failed:", err);
          }
        });
      } else {
        setImmediate(async () => {
          try {
            await ctx.services.allowanceService.createAllowance({
              walletId: walletEntity.id,
              tokenId: token?.id!,
              spender: spender.toLowerCase(),
              allowance: chainAllowance.toString(),
            });
            logger.info(
              `On-chain allowance is sufficient for spender ${spender} on token ${tokenAddress}. [DB CREATE done in background]`
            );
          } catch (err) {
            logger.error("Background DB create failed:", err);
          }
        });
      }
      return;
    }

    const dbAllowance = BigInt(allowanceRecord.allowance);
    if (dbAllowance < requiredAmount) {
      const chainAllowance = await getAllowance(
        tokenAddress,
        walletEntity.address as Hex,
        spender
      );

      if (chainAllowance < requiredAmount) {
        const { waitReceipt } = await approveInfinite(
          tokenAddress,
          spender,
          privateKey
        );
        const receipt = await waitReceipt;
        logger.info("Approve confirmed in block:", receipt.blockNumber);

        setImmediate(async () => {
          try {
            await ctx.services.allowanceService.updateAllowance(
              allowanceRecord.id,
              (2n ** 256n - 1n).toString()
            );
            logger.info(
              `Allowance updated to infinite for spender ${spender} on token ${tokenAddress} [DB UPDATE in background].`
            );
          } catch (err) {
            logger.error("Background DB update failed:", err);
          }
        });
      } else {
        setImmediate(async () => {
          try {
            await ctx.services.allowanceService.updateAllowance(
              allowanceRecord.id,
              chainAllowance.toString()
            );
            logger.info(
              "On-chain allowance is sufficient. DB record updated in background."
            );
          } catch (err) {
            logger.error("Background DB update failed:", err);
          }
        });
      }
    } else {
      logger.info(
        `Allowance already sufficient for spender ${spender} on token ${tokenAddress}. No action needed.`
      );
    }

    const end = performance.now();
    logger.info(
      `[ensureAllowance] took ${(end - start).toFixed(2)} milliseconds`
    );
  } catch (error: any) {
    logger.error(
      `Error in ensureAllowance for wallet ${walletEntity.address} and token ${tokenAddress}:`,
      error
    );
    throw new Error(
      `Could not ensure allowance for spender ${spender} on token ${tokenAddress}`
    );
  }
}
