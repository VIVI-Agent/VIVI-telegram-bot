// src/domain/trade/TradeService.ts
import { PrismaClient, Token } from "@prisma/client";

export class TokenService {
  constructor(private readonly prisma: PrismaClient) {}

  public async getTokenById(id: number): Promise<Token | null> {
    return await this.prisma.token.findUnique({
      where: { id },
    });
  }
}
