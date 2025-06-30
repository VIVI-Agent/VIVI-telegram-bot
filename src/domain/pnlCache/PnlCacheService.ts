import { PrismaClient, PnlCache } from "@prisma/client";
import { formatUnits } from "viem";

export interface PnlData {
  currentValueWei: string;
  currentPriceWei: string;
  costBasisWei: string;
  unrealizedPnlWei: string;
  realizedPnlWei: string;
  totalPnlWei: string;
  percentageReturn: string;
}

export interface CachedPnlSummary {
  token: {
    id: number;
    symbol: string;
    address: string;
    decimals: number;
  };
  balance: string;
  pnl: PnlData;
  isFromCache: boolean;
  lastUpdated: Date;
}

export class PnlCacheService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get cached PnL data for a specific holding
   */
  async getCachedHoldingPnl(holdingId: number): Promise<PnlCache | null> {
    return await this.prisma.pnlCache.findUnique({
      where: { holdingId },
      include: {
        holding: {
          include: {
            token: true,
          },
        },
      },
    });
  }

  /**
   * Get all cached PnL data for a user's holdings
   */
  async getCachedUserPnl(userId: number): Promise<CachedPnlSummary[]> {
    const cachedData = await this.prisma.pnlCache.findMany({
      where: {
        userId,
        holdingId: { not: null }, // Only holding-specific cache, not user summary
      },
      include: {
        holding: {
          include: {
            token: true,
          },
        },
      },
      orderBy: {
        lastCalculatedAt: "desc",
      },
    });

    return cachedData
      .filter((cache) => cache.holding) // Filter out any null holdings
      .map((cache) => ({
        token: {
          id: cache.holding!.token.id,
          symbol: cache.holding!.token.symbol,
          address: cache.holding!.token.address,
          decimals: cache.holding!.token.decimals,
        },
        balance: formatUnits(
          BigInt(cache.holding!.balance),
          cache.holding!.token.decimals
        ),
        pnl: {
          currentValueWei: cache.currentValueWei,
          currentPriceWei: cache.currentPriceWei,
          costBasisWei: cache.costBasisWei,
          unrealizedPnlWei: cache.unrealizedPnlWei,
          realizedPnlWei: cache.realizedPnlWei,
          totalPnlWei: cache.totalPnlWei,
          percentageReturn: cache.percentageReturn,
        },
        isFromCache: true,
        lastUpdated: cache.lastCalculatedAt,
      }));
  }

  /**
   * Save or update PnL cache for a holding
   */
  async savePnlCache(
    userId: number,
    holdingId: number,
    pnlData: PnlData
  ): Promise<PnlCache> {
    return await this.prisma.pnlCache.upsert({
      where: { holdingId },
      create: {
        userId,
        holdingId,
        ...pnlData,
        isStale: false,
        lastCalculatedAt: new Date(),
        lastBlockchainCheck: new Date(),
      },
      update: {
        ...pnlData,
        isStale: false,
        lastCalculatedAt: new Date(),
        lastBlockchainCheck: new Date(),
      },
    });
  }

  /**
   * Mark all user's PnL cache as stale (needs refresh)
   */
  async markUserCacheAsStale(userId: number): Promise<void> {
    await this.prisma.pnlCache.updateMany({
      where: { userId },
      data: { isStale: true },
    });
  }

  /**
   * Mark specific holding cache as stale
   */
  async markHoldingCacheAsStale(holdingId: number): Promise<void> {
    await this.prisma.pnlCache.updateMany({
      where: { holdingId },
      data: { isStale: true },
    });
  }

  /**
   * Get stale cache entries that need refresh
   */
  async getStaleCache(
    userId?: number,
    maxAge?: number // in minutes, default 1
  ): Promise<PnlCache[]> {
    const maxAgeMinutes = maxAge || 1;
    const staleThreshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    return await this.prisma.pnlCache.findMany({
      where: {
        ...(userId && { userId }),
        OR: [
          { isStale: true },
          { lastBlockchainCheck: { lt: staleThreshold } },
        ],
      },
      include: {
        holding: {
          include: {
            token: true,
          },
        },
      },
    });
  }

  /**
   * Delete cache for a specific holding
   */
  async deletePnlCache(holdingId: number): Promise<void> {
    await this.prisma.pnlCache.deleteMany({
      where: { holdingId },
    });
  }

  /**
   * Delete all cache for a user
   */
  async deleteUserPnlCache(userId: number): Promise<void> {
    await this.prisma.pnlCache.deleteMany({
      where: { userId },
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(userId?: number) {
    const where = userId ? { userId } : {};

    const [total, stale, fresh] = await Promise.all([
      this.prisma.pnlCache.count({ where }),
      this.prisma.pnlCache.count({
        where: { ...where, isStale: true },
      }),
      this.prisma.pnlCache.count({
        where: { ...where, isStale: false },
      }),
    ]);

    return {
      total,
      stale,
      fresh,
      hitRate: total > 0 ? (fresh / total) * 100 : 0,
    };
  }

  /**
   * Convert PnL data to ETH format for display
   */
  formatPnlForDisplay(pnlData: PnlData) {
    return {
      currentValue: formatUnits(BigInt(pnlData.currentValueWei), 18),
      currentPrice: formatUnits(BigInt(pnlData.currentPriceWei), 18),
      costBasis: formatUnits(BigInt(pnlData.costBasisWei), 18),
      unrealizedPnl: formatUnits(BigInt(pnlData.unrealizedPnlWei), 18),
      realizedPnl: formatUnits(BigInt(pnlData.realizedPnlWei), 18),
      totalPnl: formatUnits(BigInt(pnlData.totalPnlWei), 18),
      percentageReturn: pnlData.percentageReturn,
    };
  }
}
