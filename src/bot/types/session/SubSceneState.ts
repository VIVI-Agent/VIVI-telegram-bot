import {
  UserWithSettings,
  UserWithWalletAndHoldings,
  UserWithWallets,
  WalletWithHoldings,
} from "@domain";
import { BuySettings } from "@prisma/client";

export interface SubSceneState {
  instanceId: string;
  name: string;
  data: SceneData;
  active: boolean;
  tempMessageIds: number[];
}

export type SceneData =
  | InitUserSceneData
  | MainMenuSceneData
  | SettingsSceneData
  | WalletsSceneData
  | ReferralSceneData
  | PositionsSceneData;

// InitUserSceneData: Data for the init user scene,
export interface InitUserSceneData {
  step?: "creating_wallet" | "wallet_created" | "private_key_confirmed";
  pkMessageId?: number;
  walletAddress?: `0x${string}`;
}

// MainMenuSceneData: Simple data to store
export interface MainMenuSceneData {
  menuMessageId?: number;
}

// SettingsSceneData interface
export interface SettingsSceneData {
  step: string;
  userId: number;
  username: string;
  user?: UserWithSettings;
  editField?: {
    mode: SettingEditMode;
    fieldName: BuySettingsFieldName | SellSettingsFieldName;
  };

  menuMessageId?: number;
}

// WalletsSceneData interface
export interface WalletsSceneData {
  userId: number;
  username: string;
  user?: UserWithWallets;
  menuMessageId?: number;
  selectedWalletAddress?: `0x${string}`;

  // Bot Showing Private Key
  privateKeyMessageId?: number;
  // User Importing Private Key
  importingPrivateKey?: boolean;
  userPrivateKeyMessageId?: number;

  // Transfer
  transferMode?: {
    step:
      | "select_token"
      | "select_amount"
      | "enter_amount"
      | "enter_recipient"
      | "confirm_transfer";
    walletId?: number;
    tokenId?: number | "ETH";
    amount?: string;
    customAmount?: string;
    recipient?: string;
  };

  // User Importing Token on  Wallet
  importingToken?: boolean;
}

export enum SettingEditMode {
  BUY = "BUY",
  SELL = "SELL",
}

export type BuySettingsFieldName = keyof Pick<
  BuySettings,
  "amount1" | "amount2" | "amount3" | "amount4" | "amount5" | "slippage"
>;

export type SellSettingsFieldName = keyof Pick<
  BuySettings,
  "amount1" | "amount2" | "amount3" | "slippage"
>;

export interface ReferralSceneData {
  menuMessageId?: number;
  user?: any; // TODO: Define proper user type
}

export interface PositionsSceneData {
  wallets?: WalletWithHoldings[];
  menuMessageId?: number;
  state: "loading_cache" | "loading_from_chain" | "loaded";
  positions?: any[];
}
