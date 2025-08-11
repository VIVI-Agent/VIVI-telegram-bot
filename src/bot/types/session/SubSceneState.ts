import {
  DexQuoteResultBuy,
  DexQuoteResultSell,
  TokenInfoSummary,
} from "@blockchain";
import {
  UserWithSettings,
  UserWithWalletAndHoldings,
  UserWithWallets,
  UserWithWalletsAndHolding,
  WalletWithHoldings,
} from "@domain";
import { BuySettings, Token } from "@prisma/client";

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
  | PositionsSceneData
  | TradeSceneData
  | BuyEventSceneData;

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
  user?: UserWithSettings;
  editField?: {
    mode: SettingEditMode;
    fieldName: BuySettingsFieldName | SellSettingsFieldName;
  };

  menuMessageId?: number;
}

// WalletsSceneData interface
export interface WalletsSceneData {
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
  tokenAddress?: string;
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
  expectingWalletInput?: boolean;
}

export interface PositionsSceneData {
  wallets?: WalletWithHoldings[];
  menuMessageId?: number;
  state: "loading_cache" | "loading_from_chain" | "loaded";
  positions?: any[];
}

// BuyEventSceneData interface
export interface BuyEventSceneData {
  step: number;
  name?: string;
  bannerFileId?: string;
  tokenId?: number;
  tempMessageIds: number[];
}

export interface TradeSceneData {
  menuMessageId?: number;

  state?: "waiting_token" | "trade_buy" | "trade_sell";

  token?: Token;
  externalTokenInfo?: TokenInfoSummary | null;

  userWithSettings?: UserWithSettings;
  userWithWallets?: UserWithWalletsAndHolding;
  selectedWallets?: number[];

  bestDex?: DexQuoteResultBuy | DexQuoteResultSell;
  selectedAmount?: string;
  selectedSlippage?: string;

  editMode?: {
    customAmount?: boolean;
    customSlippage?: boolean;
  };
  customAmount?: string;
  customSlippage?: string;

  // Arrays para guardar todos los messageIds temporales durante validación
  tempCustomAmountMessageIds?: number[];
  tempCustomPercentageMessageIds?: number[];
  tempCustomSlippageMessageIds?: number[];
  gasSpeed?: "auto" | "fast" | "turbo";

  // Dexscreener info (computed on the fly per best DEX)
  dexscreenerLiquidityUsd?: number;
  dexscreenerPoolUrl?: string;
}
