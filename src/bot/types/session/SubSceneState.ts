export interface SubSceneState {
  instanceId: string;
  name: string;
  data: SceneData;
  active: boolean;
  tempMessageIds: number[];
}

export type SceneData = InitUserSceneData | MainMenuSceneData;

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
