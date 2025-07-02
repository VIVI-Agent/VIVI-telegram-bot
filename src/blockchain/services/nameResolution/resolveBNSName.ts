// src/bot/services/nameResolution/resolveBNSName.ts
import { l2ResolverAbi } from "@abis";
import { publicClientDRPC } from "@client";
import { Address, namehash, zeroAddress } from "viem";
import { logger } from "@logger";

export type Basename = `${string}.base`;

// Dirección del contrato BNS resolver en Base
export const BASENAME_L2_RESOLVER_ADDRESS =
  "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";

// Tipos de errores para BNS
export enum BNSErrorType {
  NOT_REGISTERED = "NOT_REGISTERED",
  NO_ADDRESS_SET = "NO_ADDRESS_SET",
  RPC_ERROR = "RPC_ERROR",
}

export interface BNSError {
  type: BNSErrorType;
  message: string;
}

/**
 * Verifica si una cadena podría ser un nombre BNS válido
 * @param input Cadena a verificar
 * @returns true si la cadena termina en .base
 */
export const isBNSName = (input: string): boolean => {
  if (!input || typeof input !== "string") return false;
  return input.toLowerCase().endsWith(".base.eth");
};

/**
 * Verifica si un nombre BNS está registrado en la blockchain
 * @param basename Nombre BNS a verificar
 * @returns true si el nombre está registrado, false en caso contrario
 */
export async function isBNSRegistered(basename: string): Promise<boolean> {
  try {
    const node = namehash(basename.toLowerCase());

    // Intentamos obtener el nombre - devuelve un string vacío si no está registrado
    const nameResult = (await publicClientDRPC.readContract({
      abi: l2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "name",
      args: [node],
    })) as string;
    logger.info(
      `[isBNSRegistered PRE EXIST] Name ${basename} nameResult: ${nameResult}`
    );

    // Si el resultado es un string vacío o nulo, consideramos que el nombre no está registrado
    const isRegistered =
      nameResult !== null && nameResult !== undefined && nameResult !== "";
    logger.info(`[isBNSRegistered] Name ${basename} exists: ${isRegistered}`);
    return isRegistered;
  } catch (err) {
    // Si hay un error en la llamada RPC, asumimos que no está registrado
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`[isBNSRegistered] Error checking ${basename}: ${reason}`);
    return false;
  }
}

/**
 * Resuelve un nombre BNS a una dirección Ethereum
 * @param basename Nombre BNS a resolver
 * @returns Dirección Ethereum o null si no se pudo resolver
 * @throws BNSError si hay un error específico de BNS
 */
export async function resolveBNSAddress(
  basename: string
): Promise<Address | null> {
  try {
    // Primero verificamos si el nombre está registrado
    const isRegistered = await isBNSRegistered(basename);
    if (!isRegistered) {
      logger.warn(`[resolveBNSAddress] Name not registered: ${basename}`);
      throw {
        type: BNSErrorType.NOT_REGISTERED,
        message: `can't do, my dear — that name's not registered yet.`,
      };
    }

    // Si está registrado, intentamos obtener la dirección
    const node = namehash(basename.toLowerCase());

    // Obtenemos la dirección usando el método addr con coinType 60 (ETH)
    const result = (await publicClientDRPC.readContract({
      abi: l2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "addr",
      args: [node, 60n], // coinType 60 = EVM chains
    })) as Address;

    logger.info(`[resolveBNSAddress] Resolved ${basename} → ${result}`);

    // Verificamos si la dirección devuelta es la dirección cero
    if (!result || result === zeroAddress || result === "0x") {
      logger.warn(`[resolveBNSAddress] No addr record for ${basename}`);
      throw {
        type: BNSErrorType.NO_ADDRESS_SET,
        message: `Sorry kiddo — that name not quite based yet. owner hasn't set an address.`,
      };
    }

    return result;
  } catch (err) {
    // Si ya es un error de BNS, lo propagamos
    if (err && typeof err === "object" && "type" in err) {
      throw err;
    }

    // Si es otro tipo de error, lo registramos como error RPC
    const reason = err instanceof Error ? err.message : String(err);
    logger.error(`[resolveBNSAddress] RPC error on ${basename}: ${reason}`);
    throw {
      type: BNSErrorType.RPC_ERROR,
      message: `Sorry kiddo, couldn't resolve the BNS name ${basename}`,
    };
  }
}
