import { Holding, PrismaClient } from "@prisma/client";

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
}
