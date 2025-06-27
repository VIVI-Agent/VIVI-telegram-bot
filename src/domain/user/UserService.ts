// src/domain/user/UserService.ts
import winston from "winston";
import { Prisma, PrismaClient, User } from "@prisma/client";
import { UserWithAll, UserWithSettings } from "./UserTypes";
import { formatEther } from "viem";

export class UserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: winston.Logger
  ) {}

  /**
   * Update the Telegram username for a user
   * @param tgUserId - The Telegram user ID
   * @param tgUsername - The new Telegram username
   * @returns The updated user or null if the user was not found
   */
  public async updateTgUsername(
    tgUserId: string,
    tgUsername: string
  ): Promise<User | null> {
    const user = await this.getUserByTgId(tgUserId);
    if (user) {
      return this.prisma.user.update({
        where: { id: user?.id },
        data: { tgUsername },
      });
    }
    return null;
  }

  /**
   * Update the Telegram user ID for a user
   * @param id - The user ID
   * @param tgUserId - The new Telegram user ID
   * @returns The updated user or null if the user was not found
   */
  public async updateTgUserId(
    id: number,
    tgUserId: string
  ): Promise<User | null> {
    return this.prisma.user.update({
      where: { id },
      data: { tgUserId: tgUserId.toString() },
    });
  }

  /**
   * Get a user by their Telegram user ID
   * @param tgUserId - The Telegram user ID
   * @returns The user or null if not found
   */
  public async getUserByTgId(tgUserId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { tgUserId: tgUserId.toString() },
    });
  }

  /**
   * Get a user by their ID
   * @param id - The user ID
   * @returns The user or null if not found
   */
  public async getUserById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Get a user by their Telegram username
   * @param tgUsername - The Telegram username
   * @returns The user or null if not found
   */
  public async getUserByTgUsername(tgUsername: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        tgUsername,
      },
    });
  }

  /**
   * Create a user with settings
   * @param data - The user data
   * @returns The created user
   */
  public async createUserWithSettings(data: {
    tgUserId?: string;
    tgUsername: string;
    referredById?: number;
  }): Promise<UserWithAll> {
    try {
      // Log referral information if present
      if (data.referredById) {
        this.logger.info(
          `[createUserWithSettings] Creating user ${data.tgUsername} with referral ID: ${data.referredById}`
        );

        // Validate that the referrer exists
        const referrer = await this.getUserById(data.referredById);
        if (!referrer) {
          this.logger.warn(
            `[createUserWithSettings] Referrer with ID ${data.referredById} not found, proceeding without referral`
          );
          data.referredById = undefined;
        }
      }

      const newUser = await this.prisma.user.create({
        data: {
          tgUserId: data.tgUserId,
          tgUsername: data.tgUsername,
          referredById: data.referredById,
          buySettings: {
            create: {
              amount1: 0.01,
              amount2: 0.05,
              amount3: 0.1,
              amount4: 0.5,
              amount5: 1.0,
              slippage: 30.0,
            },
          },
          sellSettings: {
            create: {
              amount1: 25,
              amount2: 50,
              amount3: 100,
              slippage: 30.0,
            },
          },
        },
        include: {
          buySettings: true,
          sellSettings: true,
        },
      });

      if (data.referredById) {
        this.logger.info(
          `[createUserWithSettings] User ${data.tgUsername} successfully created with referral`
        );
      }

      return newUser;
    } catch (error) {
      this.logger.error(
        `[createUserWithSettings] Error creating user ${data.tgUsername}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a user with their settings
   * @param tgUserId - The Telegram user ID
   * @returns The user with their settings or null if not found
   */
  public async getUserWithSettings(
    userId: number
  ): Promise<UserWithSettings | null> {
    return this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        buySettings: true,
        sellSettings: true,
      },
    });
  }
}
