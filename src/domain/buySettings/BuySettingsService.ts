// src/domain/buySettings/BuySettingsService.ts
import { BuySettings, PrismaClient, Prisma } from "@prisma/client";
import { BuySettingsFieldName } from "@types";

/**
 * Servicio para manejar operaciones relacionadas con la configuración de compra (buySettings).
 */
export class BuySettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Actualiza un campo específico en la configuración de compra (buySettings).
   *
   * @param buySettingsId - Identificador de la configuración a actualizar.
   * @param fieldName - Nombre del campo que se actualizará.
   * @param fieldValue - Nuevo valor que se asignará al campo.
   * @returns La configuración de compra actualizada.
   * @throws Error si los parámetros son inválidos o si ocurre un error en la base de datos.
   */
  public async updateBuySettings(
    userId: number,
    fieldName: BuySettingsFieldName, // Asegura que fieldName sea una clave válida de BuySettings
    fieldValue: number
  ): Promise<BuySettings> {
    // Validación de parámetros
    if (!userId || !fieldName || fieldValue == null) {
      throw new Error("buySettingsId, fieldName, and fieldValue are required");
    }

    // Verifica que el campo a actualizar sea válido
    const validFields: BuySettingsFieldName[] = [
      "amount1",
      "amount2",
      "amount3",
      "amount4",
      "amount5",
      "slippage",
    ];
    if (!validFields.includes(fieldName)) {
      throw new Error(`Invalid fieldName: ${fieldName}`);
    }

    try {
      return await this.prisma.buySettings.update({
        where: { userId },
        data: { [fieldName]: fieldValue },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new Error(`BuySettings with for ${userId} not found`);
        }
      }

      if (error instanceof Error) {
        throw new Error(`Failed to update buySettings: ${error.message}`);
      } else {
        throw new Error(
          "Failed to update buySettings: An unknown error occurred"
        );
      }
    }
  }
}
