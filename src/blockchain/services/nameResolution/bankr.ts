import { logger } from "@logger";
import { GlobalSceneContext } from "bot/types/session/GlobalSceneContext";

// Types for Bankr API
export type BankrPlatform = "twitter" | "farcaster";

export interface BankrWalletResponse {
  username: string;
  platform: BankrPlatform;
  accountId: string;
  evmAddress: string;
  solanaAddress: string;
  bankrClub: boolean;
}

export interface BankrErrorResponse {
  error: string;
}

export type BankrResponse = BankrWalletResponse | BankrErrorResponse;

// Error types for Bankr service
export enum BankrErrorType {
  USER_NOT_FOUND = "USER_NOT_FOUND",
  API_ERROR = "API_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  INVALID_PLATFORM = "INVALID_PLATFORM",
  INVALID_USERNAME = "INVALID_USERNAME",
}

export interface BankrServiceError {
  type: BankrErrorType;
  message: string;
  platform?: BankrPlatform;
  username?: string;
}

// Bankr API base URL
const BANKR_API_BASE_URL = "https://api-staging.bankr.bot/public/wallet";

// Database cache service instance

/**
 * Validates if a platform is supported by Bankr API
 * @param platform Platform to validate
 * @returns true if platform is valid
 */
export const isValidBankrPlatform = (
  platform: string
): platform is BankrPlatform => {
  return platform === "twitter" || platform === "farcaster";
};

/**
 * Validates if a username is valid for API calls
 * @param username Username to validate
 * @returns true if username is valid
 */
export const isValidUsername = (username: string): boolean => {
  if (!username || typeof username !== "string") return false;
  if (username.trim().length === 0) return false;
  if (username.length > 50) return false; // Reasonable limit
  return true;
};

/**
 * Searches for a username on a specific platform using Bankr API
 * @param username Username to search for
 * @param platform Platform to search on (twitter or farcaster)
 * @returns BankrWalletResponse if found, throws BankrServiceError if not found or error
 */
export async function searchBankrUsername(
  ctx: GlobalSceneContext,
  username: string,
  platform: BankrPlatform
): Promise<BankrWalletResponse> {
  try {
    // Validate inputs
    if (!isValidUsername(username)) {
      throw {
        type: BankrErrorType.INVALID_USERNAME,
        message: "Invalid username provided",
        username,
      } as BankrServiceError;
    }

    if (!isValidBankrPlatform(platform)) {
      throw {
        type: BankrErrorType.INVALID_PLATFORM,
        message: "Invalid platform. Supported platforms: twitter, farcaster",
        platform,
      } as BankrServiceError;
    }

    // Check cache first
    const cachedData = await ctx.services.bankrCacheService.getCachedData(
      username,
      platform
    );
    if (cachedData) {
      logger.info(
        `[searchBankrUsername] Cache hit for ${username} on ${platform}`
      );
      return cachedData;
    }

    // Build API URL
    const url = `${BANKR_API_BASE_URL}?username=${encodeURIComponent(
      username
    )}&platform=${platform}`;

    logger.info(
      `[searchBankrUsername] Searching for ${username} on ${platform}`
    );
    logger.debug(`[searchBankrUsername] API URL: ${url}`);

    // Make API request
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      // Check for rate limiting (429 Too Many Requests)
      if (response.status === 429) {
        logger.error(
          `[searchBankrUsername] Rate limited by Bankr API: ${errorMessage}`
        );
        throw {
          type: BankrErrorType.RATE_LIMITED,
          message: "Rate limit exceeded. Please try again in 15 minutes.",
          platform,
          username,
        } as BankrServiceError;
      }

      logger.error(`[searchBankrUsername] API request failed: ${errorMessage}`);
      throw {
        type: BankrErrorType.API_ERROR,
        message: `Failed to fetch data from Bankr API: ${errorMessage}`,
        platform,
        username,
      } as BankrServiceError;
    }

    const data = (await response.json()) as BankrResponse;

    // Check if it's an error response
    if ("error" in data) {
      logger.warn(
        `[searchBankrUsername] User not found: ${username} on ${platform}`
      );
      throw {
        type: BankrErrorType.USER_NOT_FOUND,
        message: data.error,
        platform,
        username,
      } as BankrServiceError;
    }

    // Validate successful response
    if (!data.username || !data.platform || !data.accountId) {
      logger.error(
        `[searchBankrUsername] Invalid response format for ${username} on ${platform}`
      );
      throw {
        type: BankrErrorType.API_ERROR,
        message: "Invalid response format from Bankr API",
        platform,
        username,
      } as BankrServiceError;
    }

    logger.info(
      `[searchBankrUsername] Found ${username} on ${platform}: ${data.evmAddress}`
    );

    // Store in cache for future requests
    await ctx.services.bankrCacheService.setCachedData(
      username,
      platform,
      data
    );

    return data;
  } catch (error) {
    // If it's already a BankrServiceError, re-throw it
    if (error && typeof error === "object" && "type" in error) {
      throw error;
    }

    // Handle other errors (network, parsing, etc.)
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[searchBankrUsername] Unexpected error for ${username} on ${platform}: ${errorMessage}`
    );

    throw {
      type: BankrErrorType.API_ERROR,
      message: `Unexpected error: ${errorMessage}`,
      platform,
      username,
    } as BankrServiceError;
  }
}

/**
 * Searches for a username on both Twitter and Farcaster platforms
 * @param username Username to search for
 * @returns Object with results for both platforms
 */
export async function searchBankrUsernameAllPlatforms(
  ctx: GlobalSceneContext,
  username: string
): Promise<{
  twitter?: BankrWalletResponse;
  farcaster?: BankrWalletResponse;
  errors: BankrServiceError[];
}> {
  const results: {
    twitter?: BankrWalletResponse;
    farcaster?: BankrWalletResponse;
    errors: BankrServiceError[];
  } = {
    errors: [],
  };

  const platforms: BankrPlatform[] = ["twitter", "farcaster"];

  // Search on each platform
  for (const platform of platforms) {
    try {
      const result = await searchBankrUsername(ctx, username, platform);
      results[platform] = result;
    } catch (error) {
      if (error && typeof error === "object" && "type" in error) {
        const bankrError = error as BankrServiceError;
        results.errors.push(bankrError);

        // If we hit rate limit, stop searching other platforms to avoid more rate limit errors
        if (bankrError.type === BankrErrorType.RATE_LIMITED) {
          logger.warn(
            `[searchBankrUsernameAllPlatforms] Rate limited, stopping search for other platforms`
          );
          break;
        }
      } else {
        results.errors.push({
          type: BankrErrorType.API_ERROR,
          message: error instanceof Error ? error.message : String(error),
          platform,
          username,
        });
      }
    }
  }

  return results;
}

/**
 * Gets the EVM address for a username on a specific platform
 * @param username Username to search for
 * @param platform Platform to search on
 * @returns EVM address if found, null if not found
 */
export async function getBankrEVMAddress(
  ctx: GlobalSceneContext,
  username: string,
  platform: BankrPlatform
): Promise<string | null> {
  try {
    const result = await searchBankrUsername(ctx, username, platform);
    return result.evmAddress || null;
  } catch (error) {
    if (error && typeof error === "object" && "type" in error) {
      const bankrError = error as BankrServiceError;
      if (bankrError.type === BankrErrorType.USER_NOT_FOUND) {
        return null; // User not found, return null instead of throwing
      }
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Checks if there are any rate limit errors in the results
 * @param errors Array of BankrServiceError
 * @returns true if any error is a rate limit error
 */
export function hasRateLimitError(errors: BankrServiceError[]): boolean {
  return errors.some((error) => error.type === BankrErrorType.RATE_LIMITED);
}

/**
 * Gets the next retry time for rate limited requests (15 minutes from now)
 * @returns Date object representing when rate limit will reset
 */
export function getRateLimitRetryTime(): Date {
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds
  return new Date(Date.now() + CACHE_TTL);
}

/**
 * Note: Bankr cache entries are permanent since addresses never change.
 * No cleanup is needed as the data is always valid.
 */

/**
 * Gets cache statistics from database
 */
export async function getBankrCacheStats(ctx: GlobalSceneContext) {
  return await ctx.services.bankrCacheService.getCacheStats();
}

/**
 * Clears all cache entries from database
 */
export async function clearBankrCache(
  ctx: GlobalSceneContext
): Promise<number> {
  return await ctx.services.bankrCacheService.clearAllCache();
}

/**
 * Gets all cache entries from database
 */
export async function getAllBankrCacheEntries(ctx: GlobalSceneContext) {
  return await ctx.services.bankrCacheService.getAllEntries();
}

/**
 * Gets cache entries by platform
 */
export async function getBankrCacheEntriesByPlatform(
  ctx: GlobalSceneContext,
  platform: BankrPlatform
) {
  return await ctx.services.bankrCacheService.getEntriesByPlatform(platform);
}

/**
 * Gets cache entries by username
 */
export async function getBankrCacheEntriesByUsername(
  ctx: GlobalSceneContext,
  username: string
) {
  return await ctx.services.bankrCacheService.getEntriesByUsername(username);
}

/**
 * Removes a specific cache entry
 */
export async function removeBankrCacheEntry(
  ctx: GlobalSceneContext,
  username: string,
  platform: BankrPlatform
): Promise<boolean> {
  return await ctx.services.bankrCacheService.removeCacheEntry(
    username,
    platform
  );
}
