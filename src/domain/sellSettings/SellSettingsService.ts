// src/domain/sellSettings/SellSettingsService.ts
import { SellSettings, PrismaClient, Prisma } from "@prisma/client";
import { SellSettingsFieldName } from "@types";

/**
 * Servicio para manejar operaciones relacionadas con la configuración de compra (sellSettings).
 */
export class SellSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Actualiza un campo específico en la configuración de compra (sellSettings).
   *
   * @param sellSettingsId - Identificador de la configuración a actualizar.
   * @param fieldName - Nombre del campo que se actualizará.
   * @param fieldValue - Nuevo valor que se asignará al campo.
   * @returns La configuración de compra actualizada.
   * @throws Error si los parámetros son inválidos o si ocurre un error en la base de datos.
   */
  public async updateSellSettings(
    userId: number,
    fieldName: SellSettingsFieldName, // Asegura que fieldName sea una clave válida de SellSettings
    fieldValue: number
  ): Promise<SellSettings> {
    // Validación de parámetros
    if (!userId || !fieldName || fieldValue == null) {
      throw new Error("userId, fieldName, and fieldValue are required");
    }

    // Verifica que el campo a actualizar sea válido
    const validFields: SellSettingsFieldName[] = [
      "amount1",
      "amount2",
      "amount3",
      "slippage",
    ];
    if (!validFields.includes(fieldName)) {
      throw new Error(`Invalid fieldName: ${fieldName}`);
    }

    try {
      return await this.prisma.sellSettings.update({
        where: { userId },
        data: { [fieldName]: fieldValue },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error(`Settings with userId ${userId} not found`);
        }
      }

      if (error instanceof Error) {
        throw new Error(`Failed to update sellSettings: ${error.message}`);
      } else {
        throw new Error(
          "Failed to update sellSettings: An unknown error occurred"
        );
      }
    }
  }
}
