// src/domain/feeWhitelist/FeeWhitelistService.ts
import {
  PrismaClient,
  Token,
  FeeWhitelist,
  WhitelistType,
} from "@prisma/client";
import { Address } from "viem";
import { findOrCreateToken } from "@blockchain";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

export class FeeWhitelistService {
  constructor(private readonly prisma: PrismaClient) {}

  public async getWDTokenWhitelist(
    ctx: GlobalSceneContext
  ): Promise<Token[] | undefined> {
    try {
      const whitelistEntries = await this.prisma.feeWhitelist.findMany({
        where: { type: "DAOSWORLD" },
      });
      const tokens: Token[] = [];

      for (const e of whitelistEntries) {
        const token = await findOrCreateToken(ctx, e.address as Address);
        if (token) {
          tokens.push(token);
        }
      }

      tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

      return tokens;
    } catch (error) {
      logger.error("Error en getAllTokenWhitelist:", error);
      return undefined;
    }
  }

  /**
   * Retorna un arreglo de tokens que están en la whitelist.
   * Por cada entrada en feeWhitelist, se intenta obtener o crear el token.
   * Se ordenan alfabéticamente por símbolo.
   */
  public async getAllTokenWhitelist(
    ctx: GlobalSceneContext
  ): Promise<Token[] | undefined> {
    try {
      const whitelistEntries = await this.prisma.feeWhitelist.findMany({});
      const tokens: Token[] = [];

      for (const entry of whitelistEntries) {
        const token = await findOrCreateToken(ctx, entry.address as Address);
        if (token) {
          tokens.push(token);
        }
      }

      tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
      return tokens;
    } catch (error) {
      logger.error("Error in getAllTokenWhitelist:", error);
      return undefined;
    }
  }

  /**
   * Retorna la entrada de la whitelist para un address específico.
   */
  public async getTokenWhitelist(
    address: string
  ): Promise<FeeWhitelist | null> {
    try {
      return await this.prisma.feeWhitelist.findFirst({
        where: {
          address: {
            equals: address.toLowerCase(),
            mode: "insensitive",
          },
        },
      });
    } catch (error) {
      logger.error(`Error in getTokenWhitelist for ${address}:`, error);
      throw error;
    }
  }

  async getWhitelistById(id: number): Promise<FeeWhitelist | null> {
    try {
      return await this.prisma.feeWhitelist.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error("Error in getWhitelistById:", error);
      throw error;
    }
  }

  async getAllWhitelists(): Promise<FeeWhitelist[]> {
    try {
      return await this.prisma.feeWhitelist.findMany({
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      logger.error("Error in getAllWhitelists:", error);
      throw error;
    }
  }

  async createWhitelist(data: {
    address: string;
    feeBps: number;
    bonusPointsPercent: number;
    type: WhitelistType;
  }): Promise<FeeWhitelist> {
    try {
      return await this.prisma.feeWhitelist.create({
        data,
      });
    } catch (error) {
      logger.error("Error in createWhitelist:", error);
      throw error;
    }
  }

  async updateWhitelist(
    id: number,
    data: Partial<{
      feeBps: number;
      bonusPointsPercent: number;
      type: WhitelistType;
    }>
  ): Promise<FeeWhitelist> {
    try {
      return await this.prisma.feeWhitelist.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error("Error in updateWhitelist:", error);
      throw error;
    }
  }

  async deleteWhitelist(id: number): Promise<void> {
    try {
      await this.prisma.feeWhitelist.delete({
        where: { id },
      });
    } catch (error) {
      logger.error("Error in deleteWhitelist:", error);
      throw error;
    }
  }
}
