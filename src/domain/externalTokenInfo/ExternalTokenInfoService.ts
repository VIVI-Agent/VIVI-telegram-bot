// src/domain/externalTokenInfo/ExternalTokenInfoService.ts
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import winston from "winston";

export class ExternalTokenInfoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: winston.Logger
  ) {}

  /**
   * Obtiene la información externa de un token a partir de su tokenId.
   */
  public async getExternalTokenInfo(tokenId: number) {
    try {
      return await this.prisma.externalTokenInfo.findUnique({
        where: { tokenId },
      });
    } catch (error) {
      this.logger.error("Error in getExternalTokenInfo:", error);
      throw error;
    }
  }

  /**
   * Updates or creates the external token info (upsert)
   */
  public async updateExternalTokenInfo(
    tokenId: number,
    marketCap: Decimal | undefined,
    totalSupply: string | undefined,
    holders: string | undefined,
    website: string | undefined,
    telegramLink: string | undefined,
    twitterLink: string | undefined
  ) {
    try {
      const updated = await this.prisma.externalTokenInfo.upsert({
        where: { tokenId },
        update: {
          marketCapUsd: marketCap?.toString(),
          totalSupply: totalSupply,
          totalHolders: holders ? Number(holders) : undefined,
          website: website,
          telegramLink: telegramLink,
          twitterLink: twitterLink,
          updatedAt: new Date(),
        },
        create: {
          tokenId: tokenId,
          marketCapUsd: marketCap?.toString(),
          totalSupply: totalSupply,
          totalHolders: holders ? Number(holders) : undefined,
          website: website,
          telegramLink: telegramLink,
          twitterLink: twitterLink,
          lastUpdated: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      this.logger.info(
        `[ExternalTokenInfoService] ✅ Upserted token info for token ${tokenId}: marketCap=$${marketCap?.toString()}, holders=${holders}`
      );
      return updated;
    } catch (error) {
      this.logger.error(
        `[ExternalTokenInfoService] 💥 Error upserting token info for token ${tokenId}:`,
        error
      );
      throw error;
    }
  }
}
