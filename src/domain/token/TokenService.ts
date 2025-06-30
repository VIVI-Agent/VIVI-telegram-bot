// src/domain/trade/TradeService.ts
import { PrismaClient, Token } from "@prisma/client";
import { Address, isAddress } from "viem";

export class TokenService {
  constructor(private readonly prisma: PrismaClient) {}

  public async getTokenById(id: number): Promise<Token | null> {
    return await this.prisma.token.findUnique({
      where: { id },
    });
  }

  public async getTokenByAddress(address: Address): Promise<Token | null> {
    return await this.prisma.token.findFirst({
      where: { address: { equals: address, mode: "insensitive" } },
    });
  }

  public async createToken(address: Address, token: Token): Promise<Token> {
    return await this.prisma.token.create({
      data: {
        address: address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
      },
    });
  }
}
