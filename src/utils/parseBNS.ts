// src/bot/utils/parseEthereumAddress.ts
import { isBNSName, resolveBNSAddress } from "@blockchain";
import { logger } from "@logger";
import { zeroAddress } from "viem";

/**
 * Intenta resolver un nombre BNS a una dirección Ethereum.
 * Maneja diferentes tipos de errores específicos de BNS.
 *
 * @param input Nombre BNS a resolver
 * @returns La dirección resuelta o null si hubo un error
 * @throws Error con mensajes específicos según el tipo de error
 */
export const parseBNS = async (input: string): Promise<string | null> => {
  // Validar nombre BNS
  if (isBNSName(input)) {
    logger.info(`[parseEthereumAddress] Detected BNS name: ${input}`);

    try {
      const resolvedAddress = await resolveBNSAddress(input);
      if (!resolvedAddress) {
        logger.error(
          `[parseEthereumAddress] Failed to resolve BNS name: ${input}`
        );
        return null;
      }

      // Verificar explícitamente si es dirección cero
      if (resolvedAddress === zeroAddress) {
        logger.warn(
          `[parseEthereumAddress] BNS name ${input} resolved to zero address`
        );
        throw new Error(
          `sorry kiddo — that name not quite based yet. owner hasn't set an address.`
        );
      }

      logger.info(
        `[parseEthereumAddress] Resolved BNS name ${input} to ${resolvedAddress}`
      );
      return resolvedAddress;
    } catch (error: any) {
      // La función resolveBNSAddress ya propaga mensajes de error específicos
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        "message" in error
      ) {
        logger.warn(`[parseEthereumAddress] BNS error: ${error.message}`);
        throw new Error(error.message);
      }

      // Error genérico si no es un error específico de BNS
      logger.error(
        `[parseEthereumAddress] Failed to resolve BNS name: ${input}`
      );
      throw new Error(`Sorry kiddo, couldn't resolve the BNS name ${input}`);
    }
  }

  logger.warn(`[parseEthereumAddress] Not a BNS name: ${input}`);
  return null;
};
