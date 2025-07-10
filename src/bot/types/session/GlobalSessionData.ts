import { SubSceneState } from "./SubSceneState";
import { Address } from "viem";

export interface PendingTransfer {
  amount: string;
  token: string;
  tokenAddress: Address;
  isEthTransfer: boolean;
  recipients: {
    original: string;
    address: Address;
    userId?: number;
    displayName: string;
    type: "address" | "bns" | "username";
  }[];
  invalidRecipients: { original: string; reason: string }[];
  senderWalletId: number;
  tokenDecimals: number;
  messageId: number; // ID of the confirmation message
}

export interface GlobalSessionData {
  activeSubScenes: Record<string, SubSceneState>;
  sceneOrder: string[]; // FIFO order of scene instanceIds
  version: string;

  creatingEvent?: boolean;
  buyEventSceneInstanceId?: string;
  pendingTransfer?: PendingTransfer; // Only one pending transfer allowed
}
