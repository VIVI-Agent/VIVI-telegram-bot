import { getAddress, type Address } from "viem";

export class AddressValidator {
  static parseEthereumAddress(maybeAddress: string): Address | undefined {
    try {
      return getAddress(maybeAddress);
    } catch {
      return undefined;
    }
  }
}
