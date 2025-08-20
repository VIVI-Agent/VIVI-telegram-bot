import { Holding, Prisma, PrismaClient, Token, Wallet } from "@prisma/client";
import { isAddress } from "viem";

export type HoldingWithToken = Holding & { token: Token };
export class HoldingService {
  constructor(private readonly prisma: PrismaClient) {}

  async updateHoldingFromChain(params: {
    userId: number;
    tokenId: number;
    walletId: number;
    newBalance: bigint;
  }): Promise<void> {
    const { userId, tokenId, walletId, newBalance } = params;
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

  /**
   * Update PnL state after a BUY executed inside the bot (ignoring gas/fees).
   * - Increases totalCostBasisWei by ethSpentWei
   * - Does NOT change realizedPnlWei
   */
  async updatePnLOnBuy(params: {
    userId: number;
    tokenId: number;
    walletId: number;
    ethSpentWei: bigint;
  }): Promise<void> {
    const { userId, tokenId, walletId, ethSpentWei } = params;

    await this.prisma.$transaction(async (tx) => {
      // Ensure holding row exists
      let holding = await tx.holding.findFirst({
        where: { userId, tokenId, walletId },
      });

      if (!holding) {
        holding = await tx.holding.create({
          data: {
            userId,
            tokenId,
            walletId,
            balance: "0",
          },
        });
        // Set initial cost basis and realized PnL (cast to any until migration is applied)
        await tx.holding.update({
          where: { id: holding.id },
          data: {
            // @ts-ignore – field available after migration
            totalCostBasisWei: new Prisma.Decimal(ethSpentWei.toString()),
            // @ts-ignore – field available after migration
            realizedPnlWei: new Prisma.Decimal(0),
          } as any,
        });
        return;
      }

      const currentCostBasis = new Prisma.Decimal(
        // @ts-ignore existing deployments may not have the column until migration runs
        (holding as any).totalCostBasisWei ?? "0"
      );
      const updatedCostBasis = currentCostBasis.plus(
        new Prisma.Decimal(ethSpentWei.toString())
      );

      await tx.holding.update({
        where: { id: holding.id },
        data: {
          // @ts-ignore – field available after migration
          totalCostBasisWei: updatedCostBasis,
        } as any,
      });
    });
  }

  /**
   * Update PnL state after a SELL executed inside the bot (ignoring gas/fees).
   * Uses weighted-average cost.
   */
  async updatePnLOnSell(params: {
    userId: number;
    tokenId: number;
    walletId: number;
    tokensSoldWei: bigint;
    ethReceivedWei: bigint;
  }): Promise<void> {
    const { userId, tokenId, walletId, tokensSoldWei, ethReceivedWei } = params;

    if (tokensSoldWei <= 0n) return;

    await this.prisma.$transaction(async (tx) => {
      const holding = await tx.holding.findFirst({
        where: { userId, tokenId, walletId },
      });
      if (!holding) return;

      const balanceBefore = BigInt(holding.balance || "0");
      if (balanceBefore <= 0n) return;

      const costBasisWei = new Prisma.Decimal(
        // @ts-ignore may not exist before migration
        (holding as any).totalCostBasisWei ?? "0"
      );
      const realizedAccum = new Prisma.Decimal(
        // @ts-ignore may not exist before migration
        (holding as any).realizedPnlWei ?? "0"
      );

      // avgCostWeiPerTokenWei = costBasisWei / balanceBefore
      // costBasisSold = avg * tokensSoldWei
      const avgCostPerToken = costBasisWei.div(
        new Prisma.Decimal(balanceBefore.toString())
      );
      const costBasisSold = avgCostPerToken.mul(
        new Prisma.Decimal(tokensSoldWei.toString())
      );

      const proceeds = new Prisma.Decimal(ethReceivedWei.toString());
      const realized = proceeds.minus(costBasisSold);

      // Update realized and reduce cost basis
      let newCostBasis = costBasisWei.minus(costBasisSold);
      if (newCostBasis.isNegative()) newCostBasis = new Prisma.Decimal(0);
      const newRealized = realizedAccum.plus(realized);

      await tx.holding.update({
        where: { id: holding.id },
        data: {
          // @ts-ignore – fields available after migration
          totalCostBasisWei: newCostBasis,
          // @ts-ignore – fields available after migration
          realizedPnlWei: newRealized,
        } as any,
      });
    });
  }

  /**
   * Force update holding from blockchain with retry mechanism
   * This is used after transactions to ensure database consistency
   */
  async forceUpdateHoldingFromChain(params: {
    userId: number;
    tokenId: number;
    walletId: number;
    newBalance: bigint;
  }): Promise<void> {
    const { userId, tokenId, walletId, newBalance } = params;
    const balanceStr = newBalance.toString();

    // Use a transaction to ensure consistency
    await this.prisma.$transaction(
      async (tx) => {
        // Buscar el holding existente
        const existingHolding = await tx.holding.findFirst({
          where: {
            userId,
            tokenId,
            walletId,
          },
        });

        if (!existingHolding) {
          // Si no existe, crearlo
          await tx.holding.create({
            data: {
              userId,
              tokenId,
              walletId,
              balance: balanceStr,
            },
          });
        } else {
          // Si existe, actualizar el balance
          await tx.holding.update({
            where: { id: existingHolding.id },
            data: { balance: balanceStr },
          });
        }
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );
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

  async getHoldingWithToken(
    walletId: number,
    tokenId: number
  ): Promise<HoldingWithToken | null> {
    return await this.prisma.holding.findFirst({
      where: {
        walletId,
        tokenId,
        balance: { not: "0" },
        wallet: { isDeleted: false },
      },
      include: { token: true },
    });
  }

  public getHoldingBySymbolOrAddress(
    selectedWallet: Wallet & { holdings: (Holding & { token: Token })[] },
    symbolOrCA: string
  ): (Holding & { token: Token }) | undefined {
    // Add safety check for selectedWallet
    if (!selectedWallet || !selectedWallet.holdings) {
      console.error(
        "[HoldingService] selectedWallet is undefined or has no holdings"
      );
      return undefined;
    }

    const lowerValue = symbolOrCA.toLowerCase();

    // 1. If it's an address, find by normalized address
    if (isAddress(lowerValue)) {
      return selectedWallet.holdings.find(
        (h) => h.token.address.toLowerCase() === lowerValue
      );
    }

    // 2. If it's a symbol, try multiple search strategies

    // Direct match first
    const directMatch = selectedWallet.holdings.find(
      (h) => h.token.symbol.toLowerCase() === lowerValue
    );

    if (directMatch) return directMatch;

    // Try with $ added if the input doesn't have it
    if (!lowerValue.startsWith("$")) {
      const withDollarMatch = selectedWallet.holdings.find(
        (h) => h.token.symbol.toLowerCase() === `$${lowerValue}`
      );

      if (withDollarMatch) return withDollarMatch;
    }

    // Try with $ removed if the input has it
    if (lowerValue.startsWith("$")) {
      const withoutDollarMatch = selectedWallet.holdings.find(
        (h) => h.token.symbol.toLowerCase() === lowerValue.substring(1)
      );

      if (withoutDollarMatch) return withoutDollarMatch;
    }

    // Case insensitive comparison with and without $
    return selectedWallet.holdings.find((h) => {
      const holdingSymbol = h.token.symbol.toLowerCase();
      const withoutDollarSymbol = holdingSymbol.startsWith("$")
        ? holdingSymbol.substring(1)
        : holdingSymbol;
      const withoutDollarInput = lowerValue.startsWith("$")
        ? lowerValue.substring(1)
        : lowerValue;

      return withoutDollarSymbol === withoutDollarInput;
    });
  }
}
