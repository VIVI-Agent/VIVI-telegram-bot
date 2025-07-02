// src/bot/services/tokens/getCoingeckoPrice.ts
import axios from "axios";
import { logger } from "@logger";

// Cache the ETH price with an expiration
let cachedEthPrice: { price: number; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCoingeckoEthPrice(): Promise<number> {
  try {
    // Return cached price if valid
    if (
      cachedEthPrice &&
      Date.now() - cachedEthPrice.timestamp < CACHE_DURATION
    ) {
      return cachedEthPrice.price;
    }

    // Fetch new price
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );

    if (response.data && response.data.ethereum && response.data.ethereum.usd) {
      const price = response.data.ethereum.usd;

      // Update cache
      cachedEthPrice = {
        price,
        timestamp: Date.now(),
      };

      return price;
    } else {
      throw new Error("Invalid response from CoinGecko API");
    }
  } catch (error) {
    logger.error(`[getCoingeckoEthPrice] Error: ${error}`);

    // Return cached price if available, even if expired
    if (cachedEthPrice) {
      logger.info(
        `[getCoingeckoEthPrice] Using expired cached price: ${cachedEthPrice.price}`
      );
      return cachedEthPrice.price;
    }

    // Fallback price if no cache available
    return 3500; // Default fallback ETH price
  }
}
