// src/domain/permit2/Permit2AllowanceService.ts
import { PrismaClient, Permit2Allowance, Prisma } from "@prisma/client";

/**
 * Tipo para los datos necesarios para crear un registro de permit2 allowance.
 */
export interface CreatePermit2AllowanceData {
  walletId: number;
  tokenId: number;
  spender: string;
  amount: string;
  expiration: string;
  permit2Address: string;
}

/**
 * Servicio para manejar operaciones relacionadas con Permit2 allowances.
 */
export class Permit2AllowanceService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Busca un registro de permit2 allowance para una wallet, token, spender y permit2.
   * @param walletId - ID de la wallet.
   * @param tokenId - ID del token.
   * @param spender - Dirección del spender.
   * @param permit2Address - Dirección del contrato Permit2.
   * @returns El registro de permit2 allowance o null si no se encuentra.
   * @throws Error si los parámetros son inválidos.
   */
  public async findPermit2Allowance(
    walletId: number,
    tokenId: number,
    spender: string,
    permit2Address: string
  ): Promise<Permit2Allowance | null> {
    if (!walletId || !tokenId || !spender || !permit2Address) {
      throw new Error(
        "walletId, tokenId, spender, and permit2Address are required"
      );
    }

    return this.prisma.permit2Allowance.findFirst({
      where: {
        walletId,
        tokenId,
        spender: spender.toLowerCase(), // Normaliza la dirección del spender
        permit2Address: permit2Address.toLowerCase(), // Normaliza la dirección de Permit2
      },
    });
  }

  /**
   * Crea un nuevo registro de permit2 allowance.
   * @param data - Datos para crear el permit2 allowance.
   * @returns El registro de permit2 allowance creado.
   * @throws Error si los datos son inválidos o si ocurre un error en la base de datos.
   */
  public async createPermit2Allowance(
    data: CreatePermit2AllowanceData
  ): Promise<Permit2Allowance> {
    const { walletId, tokenId, spender, amount, expiration, permit2Address } =
      data;

    if (
      !walletId ||
      !tokenId ||
      !spender ||
      !amount ||
      !expiration ||
      !permit2Address
    ) {
      throw new Error("All fields are required to create a permit2 allowance");
    }

    try {
      return await this.prisma.permit2Allowance.create({
        data: {
          walletId,
          tokenId,
          spender: spender.toLowerCase(), // Normaliza la dirección del spender
          amount,
          expiration,
          permit2Address: permit2Address.toLowerCase(), // Normaliza la dirección de Permit2
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create permit2 allowance: ${error.message}`);
      } else {
        throw new Error(
          "Failed to create permit2 allowance: An unknown error occurred"
        );
      }
    }
  }

  /**
   * Actualiza un registro de permit2 allowance dado su ID.
   * @param id - ID del registro de permit2 allowance.
   * @param amount - Nuevo valor de amount.
   * @param expiration - Nuevo valor de expiration.
   * @returns El registro de permit2 allowance actualizado.
   * @throws Error si el ID no existe o si ocurre un error en la base de datos.
   */
  public async updatePermit2Allowance(
    id: number,
    amount: string,
    expiration: string
  ): Promise<Permit2Allowance> {
    if (!id || !amount || !expiration) {
      throw new Error("id, amount, and expiration are required");
    }

    try {
      return await this.prisma.permit2Allowance.update({
        where: { id },
        data: { amount, expiration },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error(`Permit2 allowance with id ${id} not found`);
        }
      }

      if (error instanceof Error) {
        throw new Error(`Failed to update permit2 allowance: ${error.message}`);
      } else {
        throw new Error(
          "Failed to update permit2 allowance: An unknown error occurred"
        );
      }
    }
  }

  /**
   * Elimina un registro de permit2 allowance dado su ID.
   * @param id - ID del registro de permit2 allowance.
   * @returns El registro de permit2 allowance eliminado.
   * @throws Error si el ID no existe o si ocurre un error en la base de datos.
   */
  public async deletePermit2Allowance(id: number): Promise<Permit2Allowance> {
    if (!id) {
      throw new Error("id is required");
    }

    try {
      return await this.prisma.permit2Allowance.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error(`Permit2 allowance with id ${id} not found`);
        }
      }

      if (error instanceof Error) {
        throw new Error(`Failed to delete permit2 allowance: ${error.message}`);
      } else {
        throw new Error(
          "Failed to delete permit2 allowance: An unknown error occurred"
        );
      }
    }
  }

  /**
   * Verifica si un permit2 allowance ha expirado.
   * @param expiration - Timestamp de expiración como string.
   * @returns true si ha expirado, false si aún es válido.
   */
  public isExpired(expiration: string): boolean {
    const expirationTimestamp = BigInt(expiration);
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000)); // Timestamp actual en segundos
    return currentTimestamp >= expirationTimestamp;
  }

  /**
   * Verifica si la cantidad es suficiente.
   * @param currentAmount - Cantidad actual aprobada.
   * @param requiredAmount - Cantidad requerida.
   * @returns true si es suficiente, false si no.
   */
  public isSufficientAmount(
    currentAmount: string,
    requiredAmount: bigint
  ): boolean {
    const current = BigInt(currentAmount);
    return current >= requiredAmount;
  }
}
