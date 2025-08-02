import {
  KolGroup,
  KolUser,
  KolGroupSettings,
  PrismaClient,
  TradeInstruction,
  User,
} from "@prisma/client";

export interface TradeInstructionData {
  id: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  amount: string;
  originalTgUserId: string;
  groupId: string;
  groupTitle?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface TradeInstructionResult {
  success: boolean;
  data?: TradeInstructionData;
  error?: string;
}

export class TradeInstructionService {
  constructor(private prisma: PrismaClient) {}

  async getKolGroupByTgChatId(
    telegramId: number
  ): Promise<
    (KolGroup & { settings: KolGroupSettings | null; owner: KolUser }) | null
  > {
    const kolGroup = await this.prisma.kolGroup.findUnique({
      where: { telegramId: telegramId.toString() },
      include: {
        settings: true,
        owner: true,
      },
    });
    return kolGroup;
  }

  /**
   * Find a trade instruction by UUID
   * @param uuid - The UUID of the trade instruction
   * @returns TradeInstructionResult with data if found and valid
   */
  async findByUuid(uuid: string): Promise<TradeInstructionResult> {
    try {
      // Validate UUID format
      if (!this.isValidUuid(uuid)) {
        return {
          success: false,
          error: "Invalid UUID format",
        };
      }

      // Find the trade instruction
      const tradeInstruction = await this.prisma.tradeInstruction.findUnique({
        where: { id: uuid },
      });

      if (!tradeInstruction) {
        return {
          success: false,
          error: "Trade instruction not found",
        };
      }

      // Check if expired
      if (new Date() > tradeInstruction.expiresAt) {
        return {
          success: false,
          error: "Trade instruction has expired",
        };
      }

      return {
        success: true,
        data: {
          id: tradeInstruction.id,
          tokenAddress: tradeInstruction.tokenAddress,
          tokenName: tradeInstruction.tokenName || undefined,
          tokenSymbol: tradeInstruction.tokenSymbol || undefined,
          amount: tradeInstruction.amount,
          originalTgUserId: tradeInstruction.originalTgUserId,
          groupId: tradeInstruction.groupId,
          groupTitle: tradeInstruction.groupTitle || undefined,
          expiresAt: tradeInstruction.expiresAt,
          createdAt: tradeInstruction.createdAt,
        },
      };
    } catch (error) {
      console.error("Error finding trade instruction:", error);
      return {
        success: false,
        error: "Database error",
      };
    }
  }

  /**
   * Check if a user exists in the system for referral purposes
   * @param tgUserId - Telegram user ID as string
   * @returns boolean indicating if user exists
   */
  async getOriginalUserByTgUserId(tgUserId: string): Promise<User | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { tgUserId },
      });
      return user;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return null;
    }
  }

  /**
   * Clean up expired trade instructions
   * This can be called periodically to maintain database hygiene
   */
  async cleanupExpired(): Promise<number> {
    try {
      const result = await this.prisma.tradeInstruction.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      console.log(`Cleaned up ${result.count} expired trade instructions`);
      return result.count;
    } catch (error) {
      console.error("Error cleaning up expired trade instructions:", error);
      return 0;
    }
  }

  /**
   * Get statistics about trade instructions
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    expired: number;
  }> {
    try {
      const now = new Date();

      const [total, active] = await Promise.all([
        this.prisma.tradeInstruction.count(),
        this.prisma.tradeInstruction.count({
          where: {
            expiresAt: {
              gt: now,
            },
          },
        }),
      ]);

      return {
        total,
        active,
        expired: total - active,
      };
    } catch (error) {
      console.error("Error getting trade instruction statistics:", error);
      return { total: 0, active: 0, expired: 0 };
    }
  }

  /**
   * Validate UUID format
   * @param uuid - String to validate
   * @returns boolean indicating if valid UUID
   */
  private isValidUuid(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
