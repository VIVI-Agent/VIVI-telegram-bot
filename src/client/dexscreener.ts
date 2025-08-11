// src/api/client.ts
import axios from "axios";
import Bottleneck from "bottleneck";
import axiosRetry from "axios-retry";
import { logger } from "@logger";


export const dexscreenerClient = axios.create({
  baseURL: "https://api.dexscreener.com",
});

// DexScreener rate limit: 300 requests per minute = 5 requests per second
// Adding safety margin: 4.5 requests per second = ~222ms between requests
const limiter = new Bottleneck({
  minTime: 222, // 222ms between requests (4.5 req/sec with safety margin)
  maxConcurrent: 1, // One request at a time
  reservoir: 300, // Start with 300 requests available
  reservoirRefreshAmount: 300, // Refill to 300 requests
  reservoirRefreshInterval: 60 * 1000, // Every 60 seconds (1 minute)
});

dexscreenerClient.interceptors.request.use(async (config) => {
  const startTime = Date.now();
  
  await limiter.schedule(() => {
    const waitTime = Date.now() - startTime;
    if (waitTime > 0) {
      logger.debug(`DexScreener request waited ${waitTime}ms for rate limit`);
    }
    
    // Log reservoir status periodically (if available)
    try {
      const reservoir = (limiter as any).reservoir();
      if (typeof reservoir === 'number' && reservoir < 50) {
        logger.warn(`DexScreener rate limit reservoir low: ${reservoir}/300 requests remaining`);
      }
    } catch (e) {
      // Ignore if reservoir method is not available
    }
    
    return Promise.resolve();
  });
  
  return config;
});

axiosRetry(dexscreenerClient, {
  retries: 5, // More retries for rate limit issues
  retryDelay: (retryCount, error) => {
    const status = error.response?.status;
    
    if (status === 429) {
      // For rate limit errors, use exponential backoff starting at 1 second
      const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000); // Max 30 seconds
      logger.warn(`DexScreener rate limit hit, retrying in ${delay}ms (attempt ${retryCount})`);
      return delay;
    }
    
    // For other errors, shorter delay
    const delay = 1000 * retryCount;
    logger.info(`DexScreener request failed, retrying in ${delay}ms (attempt ${retryCount})`);
    return delay;
  },
  retryCondition: (error) => {
    const status = error.response?.status;
    logger.debug(`DexScreener error status: ${status}`);
    
    // Retry on rate limit (429) or server errors (5xx)
    return status === 429 || (status !== undefined && status >= 500 && status < 600);
  },
});
