/**
 * Simple validator for buy amount inputs
 */
export interface BuyValidationResult {
  isValid: boolean;
  value?: number;
  error?: string;
}

export class BuyAmountValidator {
  /**
   * Validates a buy amount string input
   * Returns the parsed number if valid, or error if invalid
   */
  static validate(input: string, isSlippage: boolean): BuyValidationResult {
    // Check for empty input
    if (!input || input.trim() === "") {
      return {
        isValid: false,
        error: isSlippage
          ? "Please enter Slippage (Min 0, Max 50)"
          : "Please enter ETH amount (eg: 0.001)",
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
        error: isSlippage
          ? "Please enter a valid Slippage (Min 0, Max 50)"
          : "Please enter a valid ETH amount (eg: 0.001)",
      };
    }

    // Check if greater than 0
    if (numValue <= 0) {
      return {
        isValid: false,
        error: isSlippage
          ? "Slippage must be greater than 0"
          : "ETH amount must be greater than 0 (eg: 0.001)",
      };
    }

    if (isSlippage && numValue > 50) {
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
