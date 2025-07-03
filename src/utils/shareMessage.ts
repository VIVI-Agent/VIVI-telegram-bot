import { viviJoinPlain } from "./messages";
import { explorerUrl } from "@client";

export function generateShareableTransferMessage(
  amount: string,
  tokenSymbol: string,
  txHash: string,
  referrerUsername?: string
): string {
  const joinLink = viviJoinPlain(referrerUsername);
  const explorerLink = `${explorerUrl}/tx/${txHash}`;

  const shareMessage = [
    `Hey! I've sent you ${amount} ${tokenSymbol.toUpperCase()} via VIVI 👑`,
    `Claim Here: ${joinLink}`,
    `Tx Hash: ${explorerLink}`,
  ].join("\n");

  return shareMessage;
}
