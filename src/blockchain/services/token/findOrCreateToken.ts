// src/bot/services/tokens/findOrCreateToken.ts
import { Address } from "viem";
import { Token } from "@prisma/client";
import { getTokenInfo } from "./getTokenInfo";
import { GlobalSceneContext } from "@types";
import { logger } from "@logger";

export async function findOrCreateToken(
  ctx: GlobalSceneContext,
  address: Address
): Promise<Token | undefined> {
  try {
    const normalizedAddress = address.toLowerCase().trim() as Address;

    // 1) Intentamos obtener el token desde DB
    let token = await ctx.services.tokenService.getTokenByAddress(
      normalizedAddress
    );

    if (token) {
      return token;
    } else {
      // 2) Si no existe, llamamos a la API
      const tokenInfo: Partial<Token> = await getTokenInfo(normalizedAddress);
      // 3) Creamos el registro en DB usando el servicio
      if (tokenInfo.name && tokenInfo.symbol && tokenInfo.decimals)
        return await ctx.services.tokenService.createToken(normalizedAddress, {
          address: normalizedAddress,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
        });
    }
  } catch (error: any) {
    logger.error(`Error en findOrCreateToken para ${address}:`, error.message);
    // Relanzar el error original para que pueda ser manejado apropiadamente upstream
    throw error;
  }
}
