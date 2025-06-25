import { GlobalSceneContext } from "../session/GlobalSceneContext";

export interface ISubScene {
  instanceId: string;
  name: string;

  // Lifecycle
  onActivate(ctx: GlobalSceneContext, data?: any): Promise<void>;
  cleanup(ctx: GlobalSceneContext): Promise<void>;

  // Event handling
  handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean>;
  handleText(ctx: GlobalSceneContext, text: string): Promise<boolean>;
}
