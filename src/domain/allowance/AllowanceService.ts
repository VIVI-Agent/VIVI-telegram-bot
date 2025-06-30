// src/domain/allowance/AllowanceService.ts
import { PrismaClient, Allowance, Prisma } from "@prisma/client";

/**
 * Tipo para los datos necesarios para crear un registro de allowance.
 */
export interface CreateAllowanceData {
  walletId: number;
  tokenId: number;
  spender: string;
  allowance: string;
}

/**
 * Servicio para manejar operaciones relacionadas con allowances.
 */
export class AllowanceService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Busca un registro de allowance para una wallet, token y spender.
   * @param walletId - ID de la wallet.
   * @param tokenId - ID del token.
   * @param spender - Dirección del spender.
   * @returns El registro de allowance o null si no se encuentra.
   * @throws Error si los parámetros son inválidos.
   */
  public async findAllowance(
    walletId: number,
    tokenId: number,
    spender: string
  ): Promise<Allowance | null> {
    if (!walletId || !tokenId || !spender) {
      throw new Error("walletId, tokenId, and spender are required");
    }

    return this.prisma.allowance.findFirst({
      where: {
        walletId,
        tokenId,
        spender: spender.toLowerCase(), // Normaliza la dirección del spender
      },
    });
  }

  /**
   * Crea un nuevo registro de allowance.
   * @param data - Datos para crear el allowance.
   * @returns El registro de allowance creado.
   * @throws Error si los datos son inválidos o si ocurre un error en la base de datos.
   */
  public async createAllowance(data: CreateAllowanceData): Promise<Allowance> {
    const { walletId, tokenId, spender, allowance } = data;

    if (!walletId || !tokenId || !spender || !allowance) {
      throw new Error("All fields are required to create an allowance");
    }

    try {
      return await this.prisma.allowance.create({
        data: {
          walletId,
          tokenId,
          spender: spender.toLowerCase(), // Normaliza la dirección del spender
          allowance,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create allowance: ${error.message}`);
      } else {
        throw new Error(
          "Failed to create allowance: An unknown error occurred"
        );
      }
    }
  }

  /**
   * Actualiza un registro de allowance dado su ID.
   * @param id - ID del registro de allowance.
   * @param allowance - Nuevo valor de allowance.
   * @returns El registro de allowance actualizado.
   * @throws Error si el ID no existe o si ocurre un error en la base de datos.
   */
  public async updateAllowance(
    id: number,
    allowance: string
  ): Promise<Allowance> {
    if (!id || !allowance) {
      throw new Error("id and allowance are required");
    }

    try {
      return await this.prisma.allowance.update({
        where: { id },
        data: { allowance },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error(`Allowance with id ${id} not found`);
        }
      }

      if (error instanceof Error) {
        throw new Error(`Failed to update allowance: ${error.message}`);
      } else {
        throw new Error(
          "Failed to update allowance: An unknown error occurred"
        );
      }
    }
  }

  /**
   * Elimina un registro de allowance dado su ID.
   * @param id - ID del registro de allowance.
   * @returns El registro de allowance eliminado.
   * @throws Error si el ID no existe o si ocurre un error en la base de datos.
   */
  public async deleteAllowance(id: number): Promise<Allowance> {
    if (!id) {
      throw new Error("id is required");
    }

    try {
      return await this.prisma.allowance.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error(`Allowance with id ${id} not found`);
        }
      }

      if (error instanceof Error) {
        throw new Error(`Failed to delete allowance: ${error.message}`);
      } else {
        throw new Error(
          "Failed to delete allowance: An unknown error occurred"
        );
      }
    }
  }
}
