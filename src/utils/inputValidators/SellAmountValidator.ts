/**
 * Simple validator for buy amount inputs
 */
export interface SellValidationResult {
  isValid: boolean;
  value?: number;
  error?: string;
}

export class SellAmountValidator {
  /**
   * Validates a buy amount string input
   * Returns the parsed number if valid, or error if invalid
   */
  static validate(input: string): SellValidationResult {
    // Check for empty input
    if (!input || input.trim() === "") {
      return {
        isValid: false,
        error: "Please enter Slippage (Min 0, Max 50)",
      };
    }

    // Clean input (remove spaces, replace commas with dots)
    const cleanInput = input.trim().replace(/,/g, ".");

    // Parse to number
    const numValue = parseFloat(cleanInput);

    // Check if it's a valid number
    if (isNaN(numValue)) {
      return {
        isValid: false,
        error: "Please enter a valid Slippage (Min 0, Max 50)",
      };
    }

    // Check if greater than 0
    if (numValue <= 0) {
      return {
        isValid: false,
        error: "Slippage must be greater than 0",
      };
    }

    if (numValue > 100) {
      return {
        isValid: false,
        error: "Slippage must be less than 50",
      };
    }

    return {
      isValid: true,
      value: numValue,
    };
  }
}
