// src/domain/externalTokenInfo/ExternalTokenInfoService.ts
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import winston from "winston";

export class ExternalPoolInfoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: winston.Logger
  ) {}

  /**
   * Obtiene la información externa de un token a partir de su tokenId.
   */
  public async getExternalPoolInfo(address: string) {
    try {
      return await this.prisma.externalPoolInfo.findUnique({
        where: { address },
      });
    } catch (error) {
      this.logger.error("Error in getExternalPoolInfo:", error);
      throw error;
    }
  }

  /**
   * Updates or creates the external token info (upsert)
   */
  public async updateExternalPoolInfo(
    address: string,
    tokenId: number,
    liquidityUsd: string | undefined
  ) {
    try {
      const updated = await this.prisma.externalPoolInfo.upsert({
        where: { address, tokenId },
        update: {
          liquidityUsd: liquidityUsd,
          updatedAt: new Date(),
        },
        create: {
          address: address,
          tokenId: tokenId,
          liquidityUsd: liquidityUsd,
          lastUpdated: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      this.logger.info(
        `[ExternalPoolInfoService] ✅ Upserted pool info for pool ${address}: liquidityUsd=${liquidityUsd}`
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
