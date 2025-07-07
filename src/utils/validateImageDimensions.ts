// Añadir esta función al archivo de utilidades o donde prefieras
import { Telegraf, Telegram } from "telegraf";
import axios from "axios";
import sharp from "sharp";
import { logger } from "@logger";
import { secrets } from "@config";

/**
 * Valida las dimensiones de una imagen enviada por Telegram
 * @param bot Instancia del bot
 * @param fileId ID del archivo de imagen
 * @param minWidth Ancho mínimo aceptable
 * @param maxWidth Ancho máximo aceptable
 * @param minHeight Alto mínimo aceptable
 * @param maxHeight Alto máximo aceptable
 * @param aspectRatio Proporción ancho/alto deseada (opcional)
 * @param aspectRatioTolerance Tolerancia para la proporción (opcional)
 * @returns Object con isValid y detalles de la imagen
 */
export async function validateImageDimensions(
  telegram: Telegram,
  fileId: string,
  minWidth = 1200,
  maxWidth = 1400,
  minHeight = 300,
  maxHeight = 400,
  aspectRatio = 3.5, // Proporción ancho/alto (3.5:1)
  aspectRatioTolerance = 0.3 // Tolerancia de ±0.3 en la proporción
) {
  try {
    // Obtener URL del archivo
    const fileInfo = await telegram.getFile(fileId);
    if (!fileInfo.file_path) {
      throw new Error("No se pudo obtener la ruta del archivo");
    }

    // Construir URL completa (necesitas el token del bot)
    const fileUrl = `https://api.telegram.org/file/bot${secrets.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    // Descargar la imagen
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

    // Obtener metadatos de la imagen con sharp
    const metadata = await sharp(response.data).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Could not get image dimensions");
    }

    // Calcular proporción actual
    const currentAspectRatio = metadata.width / metadata.height;

    // Validar dimensiones y proporción
    const isWidthValid =
      metadata.width >= minWidth && metadata.width <= maxWidth;
    const isHeightValid =
      metadata.height >= minHeight && metadata.height <= maxHeight;
    const isAspectRatioValid =
      Math.abs(currentAspectRatio - aspectRatio) <= aspectRatioTolerance;

    const isValid = isWidthValid && isHeightValid && isAspectRatioValid;

    return {
      isValid,
      width: metadata.width,
      height: metadata.height,
      actualAspectRatio: currentAspectRatio,
      expectedAspectRatio: aspectRatio,
      details: {
        isWidthValid,
        isHeightValid,
        isAspectRatioValid,
      },
    };
  } catch (error) {
    logger.error("Error validating image dimensions:", error);
    return {
      isValid: false,
      error: "The image could not be validated",
    };
  }
}
