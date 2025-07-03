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
  static validate(input: string, isSlippage: boolean): SellValidationResult {
    // Check for empty input
    if (!input || input.trim() === "") {
      return {
        isValid: false,
        error: isSlippage
          ? "Please enter Slippage (Min 0, Max 50)"
          : "Please enter Sell Percentage (Min 0, Max 100)",
      };
    }

    // Clean input (remove spaces, replace commas with dots)
    const cleanInput = input.trim().replace(/,/g, ".");

    // Parse to number - for sell percentages, only take integer part
    const numValue = isSlippage ? parseFloat(cleanInput) : parseInt(cleanInput);

    // Check if it's a valid number
    if (isNaN(numValue)) {
      return {
        isValid: false,
        error: isSlippage
          ? "Please enter a valid Slippage (Min 0, Max 50)"
          : "Please enter a valid Sell Percentage (Min 0, Max 100)",
      };
    }

    // Check if greater than 0
    if (numValue <= 0) {
      return {
        isValid: false,
        error: isSlippage
          ? "Slippage must be greater than 0"
          : "Sell Percentage must be greater than 0",
      };
    }

    if (numValue > (isSlippage ? 50 : 100)) {
      return {
        isValid: false,
        error: isSlippage
          ? "Slippage must be less than 50"
          : "Sell Percentage must be less than 100",
      };
    }

    return {
      isValid: true,
      value: numValue,
    };
  }
}
