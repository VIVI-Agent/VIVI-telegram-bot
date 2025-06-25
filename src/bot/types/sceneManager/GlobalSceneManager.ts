import { GlobalSceneContext } from "../session/GlobalSceneContext";
import { SceneData } from "../session/SubSceneState";

export interface GlobalSceneManager {
  // Scene management
  activateScene(
    ctx: GlobalSceneContext,
    sceneType: string,
    data?: SceneData
  ): Promise<string>;
  deactivateScene(ctx: GlobalSceneContext, instanceId: string): Promise<void>;

  // Event routing
  routeCallback(ctx: GlobalSceneContext, callback: string): Promise<void>;
  routeText(ctx: GlobalSceneContext, text: string): Promise<void>;
}
