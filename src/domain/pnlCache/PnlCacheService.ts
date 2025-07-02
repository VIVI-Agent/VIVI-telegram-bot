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
}
