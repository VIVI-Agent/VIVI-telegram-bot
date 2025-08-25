// src/domain/trade/TradeService.ts
import { PrismaClient, Trade } from "@prisma/client";

/**
 * Datos necesarios para crear un registro "BUY" en la tabla Trade.
 */
interface CreateBuyTradeArgs {
  userId: number;
  tokenId: number;
  walletId: number;
  txHash: string;
  ethSpent: bigint;
  tokensReceived?: bigint;
}

/**
 * Datos necesarios para crear un registro "SELL" en la tabla Trade.
 */
interface CreateSellTradeArgs {
  userId: number;
  tokenId: number;
  walletId: number;
  txHash: string;
  tokensSpent: bigint;
  ethReceived?: bigint;
}

export class TradeService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Crea un registro de tipo BUY en la tabla Trade.
   */
  public async createBuyTrade(args: CreateBuyTradeArgs): Promise<Trade> {
    return this.prisma.trade.create({
      data: {
        userId: args.userId,
        tokenId: args.tokenId,
        walletId: args.walletId,
        type: "BUY",
        txId: args.txHash,
        ethSpent: args.ethSpent.toString(),
        tokensReceived: args.tokensReceived
          ? args.tokensReceived.toString()
          : null,
      },
    });
  }

  /**
   * Crea un registro de tipo SELL en la tabla Trade.
   */
  public async createSellTrade(args: CreateSellTradeArgs): Promise<Trade> {
    return this.prisma.trade.create({
      data: {
        userId: args.userId,
        tokenId: args.tokenId,
        walletId: args.walletId,
        type: "SELL",
        txId: args.txHash,
        tokensSpent: args.tokensSpent.toString(),
        ethReceived: args.ethReceived ? args.ethReceived.toString() : null,
      },
    });
  }

  public async getTradeById(tradeId: number): Promise<Trade | null> {
    return this.prisma.trade.findUnique({
      where: { id: tradeId },
    });
  }

  /**
   * Returns all trades for a given user and token, ordered chronologically.
   */
  public async getTradesForUserToken(params: {
    userId: number;
    tokenId: number;
  }): Promise<Trade[]> {
    const { userId, tokenId } = params;
    return this.prisma.trade.findMany({
      where: { userId, tokenId },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    });
  }
}
