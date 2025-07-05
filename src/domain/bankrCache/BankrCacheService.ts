import { PrismaClient } from "@prisma/client";
import { logger } from "@logger";
import { BankrPlatform, BankrWalletResponse } from "@blockchain";

export interface BankrCacheEntry {
  id: number;
  username: string;
  platform: string;
  accountId: string;
  evmAddress: string;
  solanaAddress: string;
  bankrClub: boolean;
  lastAccessed: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankrCacheStats {
  totalEntries: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

/**
 * Bankr Cache Service for database-based caching
 * Since Bankr addresses never change, cache entries are permanent
 */
export class BankrCacheService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Gets cached data if it exists
   */
  async getCachedData(
    username: string,
    platform: BankrPlatform
  ): Promise<BankrWalletResponse | null> {
    try {
      const cacheEntry = await this.prisma.bankrCache.findUnique({
        where: {
          username_platform: {
            username: username.toLowerCase(),
            platform,
          },
        },
      });

      if (!cacheEntry) {
        return null;
      }

      // Update last accessed time
      await this.updateLastAccessed(cacheEntry.id);

      logger.info(
        `[BankrCacheService] Cache hit for ${username} on ${platform}`
      );

      return {
        username: cacheEntry.username,
        platform: cacheEntry.platform as BankrPlatform,
        accountId: cacheEntry.accountId,
        evmAddress: cacheEntry.evmAddress,
        solanaAddress: cacheEntry.solanaAddress,
        bankrClub: cacheEntry.bankrClub,
      };
    } catch (error) {
      logger.error(`[BankrCacheService] Error getting cached data: ${error}`);
      return null;
    }
  }

  /**
   * Stores data in cache (permanent storage since addresses never change)
   */
  async setCachedData(
    username: string,
    platform: BankrPlatform,
    data: BankrWalletResponse
  ): Promise<void> {
    try {
      await this.prisma.bankrCache.upsert({
        where: {
          username_platform: {
            username: username.toLowerCase(),
            platform,
          },
        },
        update: {
          accountId: data.accountId,
          evmAddress: data.evmAddress,
          solanaAddress: data.solanaAddress,
          bankrClub: data.bankrClub,
          lastAccessed: new Date(),
          updatedAt: new Date(),
        },
        create: {
          username: username.toLowerCase(),
          platform,
          accountId: data.accountId,
          evmAddress: data.evmAddress,
          solanaAddress: data.solanaAddress,
          bankrClub: data.bankrClub,
        },
      });

      logger.debug(
        `[BankrCacheService] Cached data for ${username} on ${platform}`
      );
    } catch (error) {
      logger.error(`[BankrCacheService] Error setting cached data: ${error}`);
    }
  }

  /**
   * Updates last accessed time for a cache entry
   */
  private async updateLastAccessed(id: number): Promise<void> {
    try {
      await this.prisma.bankrCache.update({
        where: { id },
        data: { lastAccessed: new Date() },
      });
    } catch (error) {
      logger.error(
        `[BankrCacheService] Error updating last accessed: ${error}`
      );
    }
  }

  /**
   * Gets cache statistics
   */
  async getCacheStats(): Promise<BankrCacheStats> {
    try {
      const [totalEntries, oldestEntry, newestEntry] = await Promise.all([
        this.prisma.bankrCache.count(),
        this.prisma.bankrCache.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        this.prisma.bankrCache.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

      return {
        totalEntries,
        oldestEntry: oldestEntry?.createdAt || null,
        newestEntry: newestEntry?.createdAt || null,
      };
    } catch (error) {
      logger.error(`[BankrCacheService] Error getting cache stats: ${error}`);
      return {
        totalEntries: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }
  }

  /**
   * Gets all cache entries (for debugging/admin purposes)
   */
  async getAllEntries(): Promise<BankrCacheEntry[]> {
    try {
      return await this.prisma.bankrCache.findMany({
        orderBy: { lastAccessed: "desc" },
      });
    } catch (error) {
      logger.error(`[BankrCacheService] Error getting all entries: ${error}`);
      return [];
    }
  }

  /**
   * Clears all cache entries
   */
  async clearAllCache(): Promise<number> {
    try {
      const result = await this.prisma.bankrCache.deleteMany({});
      const deletedCount = result.count;

      logger.info(
        `[BankrCacheService] Cleared all cache entries: ${deletedCount}`
      );
      return deletedCount;
    } catch (error) {
      logger.error(`[BankrCacheService] Error clearing all cache: ${error}`);
      return 0;
    }
  }

  /**
   * Gets entries by platform
   */
  async getEntriesByPlatform(
    platform: BankrPlatform
  ): Promise<BankrCacheEntry[]> {
    try {
      return await this.prisma.bankrCache.findMany({
        where: { platform },
        orderBy: { lastAccessed: "desc" },
      });
    } catch (error) {
      logger.error(
        `[BankrCacheService] Error getting entries by platform: ${error}`
      );
      return [];
    }
  }

  /**
   * Gets entries by username
   */
  async getEntriesByUsername(username: string): Promise<BankrCacheEntry[]> {
    try {
      return await this.prisma.bankrCache.findMany({
        where: { username: username.toLowerCase() },
        orderBy: { lastAccessed: "desc" },
      });
    } catch (error) {
      logger.error(
        `[BankrCacheService] Error getting entries by username: ${error}`
      );
      return [];
    }
  }

  /**
   * Removes a specific cache entry
   */
  async removeCacheEntry(
    username: string,
    platform: BankrPlatform
  ): Promise<boolean> {
    try {
      const result = await this.prisma.bankrCache.delete({
        where: {
          username_platform: {
            username: username.toLowerCase(),
            platform,
          },
        },
      });

      logger.info(
        `[BankrCacheService] Removed cache entry for ${username} on ${platform}`
      );
      return true;
    } catch (error) {
      logger.error(`[BankrCacheService] Error removing cache entry: ${error}`);
      return false;
    }
  }
}
