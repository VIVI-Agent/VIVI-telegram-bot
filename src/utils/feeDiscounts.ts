// src/bot/utils/feeDiscounts.ts

import { Address } from "viem";
import { WhitelistType } from "@prisma/client";
import { contracts } from "config";
import { GlobalSceneContext } from "@types";

/**
 * Configuración de descuentos especiales en fees
 */

// Usuarios con descuento del 50% (0.5% fee final)
export const SPECIAL_USERS_TIER_1 = [
  "golfwang888",
  "Eroc1",
  "whenston",
  "Based_AT",
];

// Usuarios con descuento del 75% (0.25% fee final)
export const SPECIAL_USERS_TIER_2 = ["vv_bot_owner_vv"];

/**
 * Valores de fee en basis points para cada tier
 */
export const FEE_TIERS = {
  TIER_1: 50, // 0.5%
  TIER_2: 25, // 0.25%
} as const;

/**
 * Determina el fee especial para un usuario basado en su username
 * @param username - El username de Telegram del usuario
 * @returns El fee en basis points, o null si no aplica descuento especial
 */
export function getSpecialUserFee(
  username: string | null | undefined
): number | null {
  console.log(
    `[FEE_DEBUG] getSpecialUserFee called with username: "${username}"`
  );

  if (!username) {
    console.log(`[FEE_DEBUG] No username provided, returning null`);
    return null;
  }

  console.log(
    `[FEE_DEBUG] Checking TIER_2: ${SPECIAL_USERS_TIER_2.includes(username)}`
  );
  if (SPECIAL_USERS_TIER_2.includes(username)) {
    console.log(
      `[FEE_DEBUG] User ${username} in TIER_2, returning ${FEE_TIERS.TIER_2}`
    );
    return FEE_TIERS.TIER_2;
  }

  console.log(
    `[FEE_DEBUG] Checking TIER_1: ${SPECIAL_USERS_TIER_1.includes(username)}`
  );
  if (SPECIAL_USERS_TIER_1.includes(username)) {
    console.log(
      `[FEE_DEBUG] User ${username} in TIER_1, returning ${FEE_TIERS.TIER_1}`
    );
    return FEE_TIERS.TIER_1;
  }

  console.log(
    `[FEE_DEBUG] User ${username} not in any special tier, returning null`
  );
  return null;
}

/**
 * Verifica si un usuario tiene descuento especial
 * @param username - El username de Telegram del usuario
 * @returns true si el usuario tiene descuento especial
 */
export function hasSpecialDiscount(
  username: string | null | undefined
): boolean {
  return getSpecialUserFee(username) !== null;
}

/**
 * Calcula el fee final para un token considerando:
 * 1. Descuentos especiales del usuario (TIER_1 y TIER_2 tienen máxima precedencia)
 * 2. Configuración de whitelist del token (solo si no hay descuento especial)
 * 3. Override para tokens estables (solo si no hay descuento especial)
 *
 * @param ctx - Contexto de la aplicación
 * @param tokenAddress - Dirección del token
 * @param userId - ID del usuario
 * @returns El fee final en basis points
 */
export async function calculateFinalFee(
  ctx: GlobalSceneContext,
  tokenAddress: Address,
  userId: number
): Promise<number> {
  console.log(
    `[FEE_DEBUG] Starting calculateFinalFee for userId: ${userId}, tokenAddress: ${tokenAddress}`
  );

  // 1. Obtener usuario para verificar descuentos especiales PRIMERO
  const user = await ctx.services.userService.getUserById(userId);
  console.log(
    `[FEE_DEBUG] User found: ${user?.tgUsername}, userId: ${user?.id}`
  );

  const specialFee = getSpecialUserFee(user?.tgUsername);
  console.log(`[FEE_DEBUG] Special fee calculated: ${specialFee}`);

  // 2. Si el usuario tiene descuento especial, devolver inmediatamente
  if (specialFee !== null) {
    if (user?.tgUsername && SPECIAL_USERS_TIER_1.includes(user.tgUsername)) {
      console.log(
        `[FEE_DISCOUNT] User ${user.tgUsername} gets TIER_1 discount: ${specialFee} bps (0.5%) - IMMEDIATE RETURN`
      );
    } else if (user?.tgUsername) {
      console.log(
        `[FEE_DISCOUNT] User ${user.tgUsername} gets TIER_2 discount: ${specialFee} bps (0.25%) - IMMEDIATE RETURN`
      );
    } else {
      console.log(
        `[FEE_DISCOUNT] User with special discount but no username - IMMEDIATE RETURN`
      );
    }
    return specialFee;
  }

  // 3. Solo si NO hay descuento especial, obtener configuración de whitelist del token
  const tokenWL = await ctx.services.feeWhitelistService.getTokenWhitelist(
    tokenAddress
  );
  let feePercent = tokenWL?.feeBps ?? contracts.FEE_AMOUNT;

  console.log(
    `[FEE_DEBUG] No special discount found. Token WL fee: ${tokenWL?.feeBps}, Default fee: ${contracts.FEE_AMOUNT}, feePercent: ${feePercent}`
  );

  // 4. Override para tokens estables (solo si no hay descuento especial)
  if (tokenWL?.type === WhitelistType.STABLE) {
    feePercent = 0;
    console.log(`[FEE_DEBUG] Applying STABLE override: 0`);
  }

  console.log(`[FEE_DEBUG] Final fee: ${feePercent}`);
  return feePercent;
}
