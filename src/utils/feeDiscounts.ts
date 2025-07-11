// src/bot/utils/feeDiscounts.ts

import { Address } from "viem";
import { WhitelistType } from "@prisma/client";
import { contracts } from "config";
import { GlobalSceneContext } from "@types";

/**
 * Configuración de descuentos especiales en fees
 */

// Usuarios con descuento del 50% (0.5% fee final) - Actualmente deshabilitado
export const SPECIAL_USERS_TIER_1 = ["golfwang888", "Eroc1", "whenston"];

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
  if (!username) return null;

  if (SPECIAL_USERS_TIER_2.includes(username)) {
    return FEE_TIERS.TIER_2;
  }

  if (SPECIAL_USERS_TIER_1.includes(username)) {
    return FEE_TIERS.TIER_1;
  }

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
 * 1. Configuración de whitelist del token
 * 2. Descuentos especiales del usuario
 * 3. Override para tokens estables
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
  // 1. Obtener configuración de whitelist del token
  const tokenWL = await ctx.services.feeWhitelistService.getTokenWhitelist(
    tokenAddress
  );
  let feePercent = tokenWL?.feeBps ?? contracts.FEE_AMOUNT;

  // 2. Obtener usuario para verificar descuentos especiales
  const user = await ctx.services.userService.getUserById(userId);
  const specialFee = getSpecialUserFee(user?.tgUsername);
  if (specialFee !== null) {
    feePercent = specialFee;
  }

  // 3. Override para tokens estables (tiene precedencia sobre descuentos especiales)
  if (tokenWL?.type === WhitelistType.STABLE) {
    feePercent = 0;
  }

  return feePercent;
}
