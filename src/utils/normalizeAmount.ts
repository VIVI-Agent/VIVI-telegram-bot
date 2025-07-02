/**
 * Normaliza un valor numérico que puede contener coma o punto como separador decimal
 * @param {string} amount - Monto como string que puede usar "," o "." como separador decimal
 * @returns {string} - Monto normalizado con "." como separador decimal
 */
export function normalizeAmount(amount: string): string {
  // Validar que sea un string
  if (!amount || typeof amount !== "string") {
    return amount;
  }

  // Detectar si usa coma como separador decimal
  if (amount.includes(",")) {
    // Reemplazar la coma por punto
    return amount.replace(",", ".");
  }

  return amount;
}
