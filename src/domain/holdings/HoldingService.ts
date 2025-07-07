import { Holding, PrismaClient, Token, Wallet } from "@prisma/client";
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

  async getHoldingWithTokenByUserWalletToken(
    userId: number,
    walletId: number,
    tokenId: number
  ): Promise<HoldingWithToken | null> {
    return await this.prisma.holding.findFirst({
      where: {
        userId,
        walletId,
        tokenId,
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

  public async updateHoldingCostBasis(
    holdingId: number,
    ethSpent: bigint,
    tokensBought: bigint,
    currentCostBasis: bigint,
    currentTokensBought: bigint
  ): Promise<void> {
    await this.prisma.holding.update({
      where: { id: holdingId },
      data: {
        totalCostBasis: (currentCostBasis + ethSpent).toString(),
        totalTokensBought: (currentTokensBought + tokensBought).toString(),
      },
    });
  }

  public async updateHoldingCostBasisSell(
    holdingId: number,
    ethReceived: bigint,
    tokensSold: bigint,
    currentCostBasis: bigint,
    currentTokensBought: bigint,
    currentRealizedPnl: bigint,
    isCompletelyLiquidated: boolean
  ): Promise<void> {
    await this.prisma.holding.update({
      where: { id: holdingId },
      data: {
        totalCostBasis: isCompletelyLiquidated
          ? "0"
          : (currentCostBasis - ethReceived).toString(),
        totalTokensBought: isCompletelyLiquidated
          ? "0"
          : (currentTokensBought - tokensSold).toString(),
        realizedPnlWei: isCompletelyLiquidated
          ? "0"
          : (currentRealizedPnl + ethReceived).toString(),
      },
    });
  }
}
