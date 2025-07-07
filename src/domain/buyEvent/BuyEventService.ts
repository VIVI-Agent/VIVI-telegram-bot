import { logger } from "@logger";
import { BuyEvent, PrismaClient, BuyEventResult } from "@prisma/client";
import { GlobalSceneContext } from "@types";

// Types for the service
interface BuyEventWithDetails extends BuyEvent {
  token: {
    id: number;
    symbol: string;
    address: string;
  };
  purchases: {
    id: number;
    userId: number;
    ethSpentWei: any; // Prisma.Decimal
    user: {
      id: number;
      tgUsername: string | null;
    };
  }[];
}

interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  eth: string;
  buys: number;
}

export class BuyEventService {
  constructor(private readonly prisma: PrismaClient) {}

  async getActiveGroupEvent(groupChatId: string): Promise<string | null> {
    const groupEvent = await this.prisma.buyEvent.findFirst({
      where: {
        groupChatId,
        isActive: true,
      },
    });

    return groupEvent ? groupEvent.id.toString() : null;
  }

  async getActiveGroupEventDetails(
    groupChatId: string
  ): Promise<BuyEventWithDetails | null> {
    const groupEvent = await this.prisma.buyEvent.findFirst({
      where: {
        groupChatId,
        isActive: true,
      },
      include: {
        token: {
          select: {
            id: true,
            symbol: true,
            address: true,
          },
        },
        purchases: {
          include: {
            user: {
              select: {
                id: true,
                tgUsername: true,
              },
            },
          },
        },
      },
    });

    return groupEvent as BuyEventWithDetails | null;
  }

  async createBuyEvent(
    name: string,
    bannerFileId: string,
    tokenId: number,
    groupChatId: string,
    userId: number
  ): Promise<BuyEvent> {
    const event = await this.prisma.buyEvent.create({
      data: {
        name,
        bannerImageUrl: bannerFileId,
        tokenId,
        createdBy: userId,
        groupChatId: groupChatId,
        isActive: true,
      },
    });
    logger.info(`Event created successfully with ID: ${event.id}`);
    return event;
  }

  async closeBuyEvent(eventId: number): Promise<{
    event: BuyEventWithDetails;
    result: BuyEventResult;
  }> {
    // First get the event with all details
    const event = await this.prisma.buyEvent.findUnique({
      where: { id: eventId },
      include: {
        token: {
          select: {
            id: true,
            symbol: true,
            address: true,
          },
        },
        purchases: {
          include: {
            user: {
              select: {
                id: true,
                tgUsername: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found`);
    }

    if (!event.isActive) {
      throw new Error(`Event with ID ${eventId} is already closed`);
    }

    // Close the event
    await this.prisma.buyEvent.update({
      where: { id: eventId },
      data: { isActive: false, closedAt: new Date() },
    });

    // Calculate leaderboard and statistics
    const { Prisma } = await import("@prisma/client");
    const purchases = event.purchases;

    // Calculate snapshot
    const leaderboardMap: Record<number, { eth: any; count: number }> = {};
    let biggestBuy = null;
    let totalVolumeWei = new Prisma.Decimal(0);

    for (const p of purchases) {
      const userId = p.userId;
      leaderboardMap[userId] = leaderboardMap[userId] || {
        eth: new Prisma.Decimal(0),
        count: 0,
      };

      leaderboardMap[userId].eth = leaderboardMap[userId].eth.add(
        p.ethSpentWei
      );
      leaderboardMap[userId].count++;
      totalVolumeWei = totalVolumeWei.add(p.ethSpentWei);

      if (!biggestBuy || p.ethSpentWei.gt(biggestBuy.ethSpentWei)) {
        biggestBuy = p;
      }
    }

    const mostPurchasesUserId = Object.entries(leaderboardMap).sort(
      (a, b) => b[1].count - a[1].count
    )[0]?.[0];

    const snapshot: LeaderboardEntry[] = Object.entries(leaderboardMap)
      .sort((a, b) => Number(b[1].eth) - Number(a[1].eth))
      .slice(0, 10)
      .map(([userId, data], idx) => {
        const user = purchases.find((p) => p.userId === Number(userId))?.user;
        return {
          rank: idx + 1,
          userId: Number(userId),
          username: user?.tgUsername || `User ${userId}`,
          eth: data.eth.toString(),
          buys: data.count,
        };
      });

    // Save event result
    const result = await this.prisma.buyEventResult.create({
      data: {
        eventId: event.id,
        leaderboardSnapshot: snapshot as any, // Convert to JSON
        biggestBuyUserId: biggestBuy?.userId || null,
        biggestBuyAmountWei: biggestBuy?.ethSpentWei || null,
        mostPurchasesUserId: mostPurchasesUserId
          ? Number(mostPurchasesUserId)
          : null,
        totalVolumeWei,
      },
    });

    logger.info(
      `Event ${eventId} closed successfully with ${purchases.length} purchases`
    );

    return {
      event: event as BuyEventWithDetails,
      result,
    };
  }

  async getEventResult(eventId: number): Promise<BuyEventResult | null> {
    return await this.prisma.buyEventResult.findUnique({
      where: { eventId },
    });
  }

  async registerPurchaseInActiveEvent(
    tokenId: number,
    groupChatId: string,
    userId: number,
    walletId: number,
    txHash: string,
    ethSpentWei: any, // Prisma.Decimal
    tokensReceivedWei: any // Prisma.Decimal
  ): Promise<boolean> {
    try {
      // Find active event for this token and group
      const activeEvent = await this.prisma.buyEvent.findFirst({
        where: {
          isActive: true,
          tokenId: tokenId,
          groupChatId: groupChatId,
        },
      });

      if (!activeEvent) {
        logger.debug(
          `No active event found for token ${tokenId} in group ${groupChatId}`
        );
        return false;
      }

      // Register the purchase
      await this.prisma.buyEventPurchase.create({
        data: {
          eventId: activeEvent.id,
          userId,
          walletId,
          txHash,
          ethSpentWei,
          tokensReceivedWei,
        },
      });

      logger.info(
        `Purchase registered in event '${activeEvent.name}' for user ${userId}: ${ethSpentWei} Wei spent, ${tokensReceivedWei} tokens received.`
      );
      return true;
    } catch (error) {
      logger.error(
        `Failed to register purchase in active event for user ${userId}: ${
          error instanceof Error ? error.message : error
        }`
      );
      return false;
    }
  }
}
