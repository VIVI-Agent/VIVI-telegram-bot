// src/domain/wallet/WalletService.ts
import { PrismaClient, Wallet } from "@prisma/client";
import { Address } from "viem";

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
}
