import { Holding, PrismaClient, Token } from "@prisma/client";

export type HoldingWithToken = Holding & { token: Token };
export class HoldingService {
  constructor(private readonly prisma: PrismaClient) {}

  async updateHoldingFromChain(params: {
    userId: number;
    tokenId: number;
    walletId: number;
    newBalance: bigint;
    holdingService: HoldingService;
  }): Promise<void> {
    const { userId, tokenId, walletId, newBalance, holdingService } = params;
    const balanceStr = newBalance.toString();

    // Buscar el holding existente
    const existingHolding = await this.prisma.holding.findFirst({
      where: {
        userId,
        tokenId,
        walletId,
      },
    });

    if (!existingHolding) {
      // Si no existe, crearlo
      await this.prisma.holding.create({
        data: {
          userId,
          tokenId,
          walletId,
          balance: balanceStr,
        },
      });
    } else {
      // Si existe, actualizar el balance
      await this.prisma.holding.update({
        where: { id: existingHolding.id },
        data: { balance: balanceStr },
      });
    }
  }

  async getHoldingsByUserId(userId: number): Promise<HoldingWithToken[]> {
    return await this.prisma.holding.findMany({
      where: {
        userId,
        balance: { not: "0" },
        wallet: { isDeleted: false },
      },
      include: { token: true },
    });
  }

  async getHoldingById(holdingId: number): Promise<HoldingWithToken | null> {
    return await this.prisma.holding.findUnique({
      where: { id: holdingId },
      include: { token: true },
    });
  }

  async getHoldingByTokenId(
    userId: number,
    tokenId: number
  ): Promise<Holding | null> {
    return await this.prisma.holding.findFirst({
      where: {
        userId,
        tokenId,
        balance: { not: "0" },
        wallet: { isDeleted: false },
      },
    });
  }
}
