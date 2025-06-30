export class SendAmountValidator {
  static parseAmount(maybeAmount: string): number | undefined {
    try {
      const amount = parseFloat(maybeAmount);

      // Check if it's a valid number
      if (isNaN(amount) || !isFinite(amount)) {
        return undefined;
      }

      // Check if it's positive
      if (amount <= 0) {
        return undefined;
      }

      return amount;
    } catch {
      return undefined;
    }
  }

  static isValidAmount(maybeAmount: string): boolean {
    return this.parseAmount(maybeAmount) !== undefined;
  }
}
