import { UserWithWallets, WalletWithHoldings } from "@domain";
import { BaseService, GlobalSceneContext, WalletsSceneData } from "../../types";
import { Token, Wallet } from "@prisma/client";
import {
  createBaseWallet,
  decryptPrivateKey,
  encryptExistingPrivateKey,
} from "@services";
import { formatEthBalanceWithSymbol } from "@utils";
import { transferETH } from "transactions/transferETH";
import { getAddress, parseEther, TransactionReceipt } from "viem";

export class WalletsService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "WalletsService");
  }

  async loadUserData(
    ctx: GlobalSceneContext,
    userId: number
  ): Promise<UserWithWallets | null> {
    this.log("info", ctx, "Loading user data");

    try {
      if (ctx.user.id) {
        return await ctx.services.userService.getUserWithWallets(userId);
      }
    } catch (error) {
      this.logError(ctx, "loadUserData", error);
      throw error;
    }
    return null;
  }

  async selectWallet(
    ctx: GlobalSceneContext,
    walletId: string
  ): Promise<Wallet> {
    this.log("info", ctx, "Selecting wallet");
    try {
      return await ctx.services.walletService.selectWallet(
        ctx.user.id,
        Number(walletId)
      );
    } catch (error) {
      this.logError(ctx, "selectWallet", error);
      throw error;
    }
  }

  async createWallet(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData
  ): Promise<{ address: string; privateKey: string }> {
    try {
      const { address, encryptedPrivKey, privateKey } =
        await createBaseWallet();

      await ctx.services.walletService.createUserWallet(
        sceneData.user!.id!,
        address,
        encryptedPrivKey,
        false
      );
      return {
        address,
        privateKey,
      };
    } catch (error) {
      this.logError(ctx, "createWallet", error);
      throw error;
    }
  }

  async softDeleteWallet(
    ctx: GlobalSceneContext,
    walletId: string
  ): Promise<void> {
    try {
      await ctx.services.walletService.softDeleteWallet(Number(walletId));
    } catch (error) {
      this.logError(ctx, "softDeleteWallet", error);
      throw error;
    }
  }

  async getWalletById(
    ctx: GlobalSceneContext,
    walletId: number
  ): Promise<Wallet | null> {
    try {
      return await ctx.services.walletService.getWalletById(walletId);
    } catch (error) {
      this.logError(ctx, "getWalletById", error);
      throw error;
    }
  }

  async importWallet(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    address: string,
    privateKey: string
  ): Promise<{
    wallet?: Wallet;
    deleted?: boolean;
    existing?: boolean;
    invalid?: boolean;
  } | null> {
    try {
      const deletedWallet =
        await ctx.services.walletService.getWalletByAddressIncludingDeleted(
          address
        );
      if (deletedWallet) {
        return { deleted: true };
      }

      const existingWallet =
        await ctx.services.walletService.getWalletByAddress(address);
      if (existingWallet) {
        return { existing: true };
      }

      const encryptedPrivKey = encryptExistingPrivateKey(privateKey);
      const decryptedPrivKey = decryptPrivateKey(encryptedPrivKey);

      if (decryptedPrivKey.toLowerCase() !== privateKey.toLowerCase()) {
        return { invalid: true };
      }

      const newWallet = await ctx.services.walletService.createUserWallet(
        sceneData.user!.id!,
        address as `0x${string}`,
        encryptedPrivKey,
        false
      );
      return { wallet: newWallet };
    } catch (error) {
      this.logError(ctx, "importWallet", error);
      throw error;
    }
  }

  async getWalletWithHoldings(
    ctx: GlobalSceneContext,
    walletId: number
  ): Promise<WalletWithHoldings | null> {
    return await ctx.services.walletService.getWalletWithHoldings(walletId);
  }

  async getTokenById(
    ctx: GlobalSceneContext,
    tokenId: number
  ): Promise<Token | null> {
    return await ctx.services.tokenService.getTokenById(tokenId);
  }

  async transferETH(
    ctx: GlobalSceneContext,
    sceneData: WalletsSceneData,
    recipient: string
  ): Promise<{
    txHash: `0x${string}`;
    waitReceipt: Promise<TransactionReceipt>;
  }> {
    const wallet = await ctx.services.walletService.getWalletById(
      sceneData.transferMode?.walletId!
    );
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    const amount = sceneData.transferMode?.amount;
    const customAmount = sceneData.transferMode?.customAmount;

    let amountInWei;

    try {
      if (customAmount) {
        // Convert custom amount string to wei
        amountInWei = parseEther(customAmount);
      } else if (amount) {
        // Calculate percentage of wallet balance
        const percentage = BigInt(amount);
        const balanceInWei = BigInt(wallet.balance);
        amountInWei = (balanceInWei * percentage) / BigInt(100);
      } else {
        throw new Error("No amount specified for transfer");
      }
    } catch (error) {
      this.logError(ctx, "transferETH", error);
      throw new Error("Invalid amount format");
    }

    const balanceInWei = BigInt(wallet.balance);
    const recipientAddress = getAddress(recipient);

    if (balanceInWei <= amountInWei) {
      throw new Error(
        `Insufficient balance you are trying to transfer ${formatEthBalanceWithSymbol(
          amountInWei
        )} ETH but you have ${formatEthBalanceWithSymbol(balanceInWei)} ETH`
      );
    }
    const decryptedPrivKey = decryptPrivateKey(wallet.encryptedPrivKey);

    const tx = await transferETH({
      privateKey: decryptedPrivKey,
      to: recipientAddress,
      desiredAmountWei: amountInWei,
    });

    this.log("info", ctx, `Transfer ETH: ${tx.txHash}`);

    return tx;
  }
}
