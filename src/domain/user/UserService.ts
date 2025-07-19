// src/domain/user/UserService.ts
import winston from "winston";
import { Prisma, PrismaClient, SpeedEnum, User } from "@prisma/client";
import {
  UserWithAll,
  UserWithSelectedWalletAndHoldings,
  UserWithSettings,
  UserWithWallets,
  UserWithWalletsAndHolding,
} from "./UserTypes";
import { formatEther } from "viem";
import { formatEthBalanceWithSymbol, formatPoints } from "@utils";

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
    referralTgUsername?: string;
  }): Promise<UserWithAll> {
    try {
      let referrer: User | null = null;
      // Log referral information if present
      if (data.referralTgUsername) {
        this.logger.info(
          `[createUserWithSettings] Creating user ${data.tgUsername} with referral: ${data.referralTgUsername}`
        );

        // Validate that the referrer exists
        referrer = await this.getUserByTgUsername(data.referralTgUsername);
        if (!referrer) {
          this.logger.warn(
            `[createUserWithSettings] Referral ${data.referralTgUsername} not found, proceeding without referral`
          );
          data.referralTgUsername = undefined;
        }
      }

      const newUser = await this.prisma.user.create({
        data: {
          tgUserId: data.tgUserId,
          tgUsername: data.tgUsername,
          referredById: referrer?.id ?? undefined,
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

  public async updateUserSpeed(
    id: number,
    newSpeed: SpeedEnum
  ): Promise<User | null> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) return null;

    return this.prisma.user.update({
      where: { id },
      data: { speed: newSpeed },
    });
  }

  public async getUserWithWallets(id: number): Promise<UserWithWallets | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        wallets: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  public async getUserWithReferralInfoByTgUserId(tgUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { tgUserId },
    });
    if (!user) return null;
    return this.getUserWithReferralInfo(user.id);
  }

  public async getUserWithReferralInfo(userId: number) {
    // 1) Obtenemos el user + referrals
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tgUsername: true,
        points: true,
        referralPoints: true,
        totalVolumeBoughtWei: true,
        totalVolumeSoldWei: true,
        rewardWallet: true,
        referrals: {
          select: {
            tgUsername: true,
            totalVolumeBoughtWei: true,
            totalVolumeSoldWei: true,
          },
        },
      },
    });

    if (!user) return null;

    // 2) Calculamos el volumen total de los referidos (bought + sold)
    let referralVolumeBought = new Prisma.Decimal(0);
    let referralVolumeSold = new Prisma.Decimal(0);
    for (const ref of user.referrals) {
      referralVolumeBought = referralVolumeBought.add(ref.totalVolumeBoughtWei);
      referralVolumeSold = referralVolumeSold.add(ref.totalVolumeSoldWei);
    }
    const totalReferralVolumeWei = referralVolumeBought.add(referralVolumeSold);
    const totalReferralVolumeBigInt = BigInt(totalReferralVolumeWei.toString());
    const referralVolumeEthString = formatEthBalanceWithSymbol(
      totalReferralVolumeBigInt
    );

    this.logger.info(
      `[getUserWithReferralInfo] total referral volume: ${referralVolumeEthString} ETH`
    );

    // 3) Formateamos los puntos
    const formattedPoints = user.points.toNumber();
    const formattedReferralPoints =
      user.referralPoints.toNumber() + 690 * user.referrals.length;

    this.logger.info(
      `[getUserWithReferralInfo] total referral points: ${formattedReferralPoints}`
    );

    // 4) Mapeamos
    const mappedReferrals = user.referrals.map((r) => ({
      tgUsername: r.tgUsername,
    }));

    // 5) Retornamos un objeto final
    return {
      id: user.id,
      tgUsername: user.tgUsername,
      points: formattedPoints,
      referralPoints: formatPoints(formattedReferralPoints),
      totalVolumeBoughtWei: user.totalVolumeBoughtWei,
      totalVolumeSoldWei: user.totalVolumeSoldWei,
      totalReferralVolume: referralVolumeEthString,
      rewardWallet: user.rewardWallet,
      referrals: mappedReferrals,
    };
  }

  public async getUserByUsername(tgUsername: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        tgUsername: {
          equals: tgUsername.trim(),
          mode: "insensitive",
        },
      },
    });
  }

  public async getUserWalletsWithHolding(
    userId: number,
    tokenId: number
  ): Promise<UserWithWalletsAndHolding | null> {
    // Use a fresh transaction to avoid cache issues
    const result = await this.prisma.$transaction(
      async (tx) => {
        return await tx.user.findUnique({
          where: { id: userId },
          include: {
            wallets: {
              orderBy: { createdAt: "asc" },
              where: { isDeleted: false },
              include: {
                holdings: {
                  where: { tokenId },
                  include: { token: true },
                  take: 1, // Solo tomar el primer holding
                },
              },
            },
          },
        });
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    if (!result) return null;

    // Transformar el resultado para que holdings sea un objeto individual en lugar de array
    return {
      ...result,
      wallets: result.wallets.map((wallet) => ({
        ...wallet,
        holdings: wallet.holdings[0] || null, // Tomar el primer holding o null si no existe
      })),
    } as UserWithWalletsAndHolding;
  }

  public async updateUserVolumeBuy(
    id: number,
    ethInBN: bigint
  ): Promise<User | null> {
    const ethInWeiDecimal = new Prisma.Decimal(ethInBN.toString()); // Convertir a Decimal

    return this.prisma.user.update({
      where: { id },
      data: {
        totalVolumeBoughtWei: { increment: ethInWeiDecimal }, // Usar Decimal
      },
    });
  }

  public async updateUserVolumeSell(
    id: number,
    ethInBN: bigint
  ): Promise<User | null> {
    const ethInWeiDecimal = new Prisma.Decimal(ethInBN.toString()); // Convertir a Decimal

    return this.prisma.user.update({
      where: { id },
      data: {
        totalVolumeSoldWei: { increment: ethInWeiDecimal }, // Usar Decimal
      },
    });
  }

  public async getUserWithSelectedWalletAndHoldingsByUserId(
    userId: number
  ): Promise<UserWithSelectedWalletAndHoldings | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        wallets: {
          where: { isSelected: true, isDeleted: false },
          include: {
            holdings: {
              include: {
                token: true,
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    // Filtrar Holdings con balance > 0
    for (const wallet of user.wallets) {
      wallet.holdings = wallet.holdings.filter((h) => BigInt(h.balance) > 0n);
    }

    return user;
  }

  public async updateUserPoints(params: {
    userId: number;
    ethVolumeWei: bigint;
    bonusPercent?: number;
  }): Promise<number> {
    const { userId, ethVolumeWei, bonusPercent = 0 } = params;

    const { userPointsAdded } = await this.prisma.$transaction(
      async (tx) => {
        const weiDecimal = new Prisma.Decimal(ethVolumeWei.toString());
        const basePoints = weiDecimal.div("1e18").mul("10000");
        const bonusPoints = basePoints.mul(
          new Prisma.Decimal(bonusPercent).div(100)
        );
        const totalPointsDecimal = basePoints.add(bonusPoints);

        const user = await tx.user.update({
          where: { id: userId },
          data: {
            points: { increment: totalPointsDecimal },
          },
          select: {
            id: true,
            referredById: true,
          },
        });

        const userPointsAdded = parseFloat(totalPointsDecimal.toString());

        if (user.referredById) {
          const config = await tx.globalConfig.findUnique({ where: { id: 1 } });
          const referralBonusPercent = config?.referralBonusPercent ?? 50;

          const referralBonusDecimal = totalPointsDecimal
            .mul(new Prisma.Decimal(referralBonusPercent))
            .div("100");

          await tx.user.update({
            where: { id: user.referredById },
            data: {
              referralPoints: { increment: referralBonusDecimal },
            },
          });
        }

        return { userPointsAdded };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    return userPointsAdded;
  }

  /**
   * Update user's reward wallet
   * @param id - The user ID
   * @param rewardWallet - The reward wallet address or null to clear
   * @returns The updated user or null if the user was not found
   */
  public async updateRewardWallet(
    id: number,
    rewardWallet: string | null
  ): Promise<User | null> {
    return this.prisma.user.update({
      where: { id },
      data: { rewardWallet },
    });
  }
}
