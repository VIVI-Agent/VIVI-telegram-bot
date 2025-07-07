import { SubSceneState } from "./SubSceneState";

export interface GlobalSessionData {
  activeSubScenes: Record<string, SubSceneState>;
  sceneOrder: string[]; // FIFO order of scene instanceIds
  version: string;

  creatingEvent?: boolean;
  buyEventSceneInstanceId?: string;
}
