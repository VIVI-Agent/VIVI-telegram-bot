// src/services/walletService.ts
import crypto from "crypto";
import { Address, formatEther, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { logger } from "@logger";
import { secrets } from "@config";
import { publicClientDRPC } from "@client";

const ALGORITHM = "aes-256-gcm";
const keyBuffer = Buffer.from(secrets.ENCRYPTION_KEY, "hex");

export function encryptExistingPrivateKey(privateKey: string): string {
  const { encrypted, authTag, iv } = encryptPrivateKey(privateKey);
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export async function createBaseWallet(): Promise<{
  address: Address;
  encryptedPrivKey: string;
  privateKey: string;
}> {
  const { privateKey, account } = createRandomViemWallet();
  const { encrypted, authTag, iv } = encryptPrivateKey(privateKey);

  const combined = Buffer.concat([iv, authTag, encrypted]).toString("base64");

  return {
    address: account.address,
    encryptedPrivKey: combined,
    privateKey: privateKey,
  };
}

function createRandomViemWallet() {
  const rawBytes = crypto.randomBytes(32);
  const privateKey = ("0x" + rawBytes.toString("hex")) as Hex;

  const account = privateKeyToAccount(privateKey);

  return { privateKey, account };
}

function encryptPrivateKey(privateKey: string): {
  encrypted: Buffer;
  authTag: Buffer;
  iv: Buffer;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: 16,
  });

  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { encrypted, authTag, iv };
}

export function decryptPrivateKey(encryptedData: string): `0x${string}` {
  const data = Buffer.from(encryptedData, "base64");

  const iv = data.slice(0, 12);
  const authTag = data.slice(12, 12 + 16);
  const ciphertext = data.slice(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const hexString = decrypted.toString("utf8");

  if (hexString.startsWith("0x")) {
    return hexString as `0x${string}`;
  } else {
    return `0x${hexString}` as `0x${string}`;
  }
}

export async function getWalletBalance(address: Address): Promise<bigint> {
  try {
    const wethBalance = await publicClientDRPC.getBalance({
      address: address,
    });
    logger.info(`Wallet: ${address} - Balance ${formatEther(wethBalance)}`);
    return wethBalance;
  } catch (error) {
    logger.error(`Failed to fetch balance for wallet ${address}:`, error);
    throw new Error("Failed to fetch wallet balance.");
  }
}
