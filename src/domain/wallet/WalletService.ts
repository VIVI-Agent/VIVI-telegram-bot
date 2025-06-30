// src/domain/wallet/WalletService.ts
import { Prisma, PrismaClient, Wallet } from "@prisma/client";
import { Address } from "viem";

export type WalletWithHoldings = Prisma.WalletGetPayload<{
  include: {
    holdings: {
      include: {
        token: true;
      };
    };
  };
}>;
export class WalletService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get the user wallet
   * @param userId - The user ID
   * @returns The user wallet or null if not found
   */
  public async getUserWallet(userId: number): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: { userId, isSelected: true, isDeleted: false },
    });
  }

  /**
   * Crea una wallet asociada a un usuario.
   * @param userId - ID del usuario
   * @param address - Dirección de la wallet en formato Hex
   * @param encryptedPrivKey - Llave privada encriptada
   * @param isSelected - Indica si esta wallet se marcará como "seleccionada"
   */
  public async createUserWallet(
    userId: number,
    address: Address,
    encryptedPrivKey: string,
    isSelected: boolean
  ): Promise<Wallet> {
    return this.prisma.wallet.create({
      data: {
        address,
        encryptedPrivKey,
        isSelected,
        userId,
        balance: "0",
      },
    });
  }

  public async getUserWallets(id: number): Promise<Wallet[]> {
    return this.prisma.wallet.findMany({
      where: {
        isDeleted: false,
        user: {
          id,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  public async selectWallet(userId: number, walletId: number): Promise<Wallet> {
    await this.prisma.wallet.updateMany({
      where: { userId, isSelected: true },
      data: { isSelected: false },
    });

    return this.prisma.wallet.update({
      where: { id: walletId },
      data: { isSelected: true },
    });
  }

  public async softDeleteWallet(walletId: number): Promise<any> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.isSelected) {
      throw new Error(
        "Cannot delete a wallet that is currently selected. Please select another wallet first."
      );
    }

    return this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  public async getWalletById(walletId: number): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
  }

  public async getWalletByAddressIncludingDeleted(
    address: string
  ): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: { address, isDeleted: true },
    });
  }

  public async getWalletByAddress(address: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: {
        address: {
          equals: address,
          mode: "insensitive",
        },
      },
    });
  }

  public async getWalletWithHoldings(
    walletId: number
  ): Promise<WalletWithHoldings | null> {
    return this.prisma.wallet.findUnique({
      where: { id: walletId, isDeleted: false },
      include: {
        holdings: {
          where: {
            balance: { not: "0" },
          },
          include: {
            token: true,
          },
        },
      },
    });
  }

  public async getUserWalletsWithHoldings(
    userId: number
  ): Promise<WalletWithHoldings[]> {
    return this.prisma.wallet.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        holdings: {
          include: {
            token: true,
          },
        },
      },
    });
  }

  public async updateWalletBalance(
    walletId: number,
    balance: bigint
  ): Promise<Wallet> {
    return this.prisma.wallet.update({
      where: { id: walletId },
      data: { balance: balance.toString() },
    });
  }
}
