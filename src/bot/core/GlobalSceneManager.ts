import { logger } from "@logger";
import {
  GlobalSceneManager,
  GlobalSceneContext,
  ISubScene,
  SubSceneState,
} from "../types";

export class GlobalSceneManagerImpl implements GlobalSceneManager {
  private readonly MAX_SCENES_PER_USER = 5;

  constructor() {
    // No more scenes map - everything is dynamic from Redis session
  }

  // Helper method to create scene instances dynamically
  private async createSceneInstance(
    sceneType: string,
    instanceId: string
  ): Promise<ISubScene> {
    let scene: ISubScene;
    switch (sceneType) {
      case "InitUser":
        const { InitUserSubScene } = await import(
          "../scenes/initUser/InitUserSubScene"
        );
        scene = new InitUserSubScene(instanceId);
        break;
      case "MainMenu":
        const { MainMenuSubScene } = await import(
          "../scenes/mainMenu/MainMenuSubScene"
        );
        scene = new MainMenuSubScene(instanceId);
        break;
      case "Settings":
        const { SettingsSubScene } = await import(
          "../scenes/settings/SettingsSubScene"
        );
        scene = new SettingsSubScene(instanceId);
        break;
      default:
        throw new Error(`Unknown scene type: ${sceneType}`);
    }
    return scene;
  }

  async activateScene(
    ctx: GlobalSceneContext,
    sceneType: string,
    data?: any
  ): Promise<string> {
    logger.info(`Activating scene: ${sceneType}`);
    const instanceId = `${sceneType}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Initialize session if needed
    if (!ctx.session) {
      ctx.session = {
        activeSubScenes: {},
        sceneOrder: [],
        version: "1.0.0",
      };
    }

    // Initialize sceneOrder if missing (for existing sessions)
    if (!ctx.session.sceneOrder) {
      ctx.session.sceneOrder = [];
    }

    // Create scene instance dynamically
    const scene = await this.createSceneInstance(sceneType, instanceId);

    // Create scene state
    const sceneState: SubSceneState = {
      instanceId,
      name: sceneType,
      data: data || {},
      active: true,
      tempMessageIds: [],
    };

    // Add to session and manage FIFO
    ctx.session.activeSubScenes[instanceId] = sceneState;
    await this.addSceneToOrder(ctx, instanceId);

    // Activate the scene
    await scene.onActivate(ctx, data);

    return instanceId;
  }

  async deactivateScene(
    ctx: GlobalSceneContext,
    instanceId: string
  ): Promise<void> {
    const sceneState = ctx.session.activeSubScenes[instanceId];
    if (sceneState) {
      // Create scene instance dynamically for cleanup
      const scene = await this.createSceneInstance(sceneState.name, instanceId);

      // Cleanup scene
      await scene.cleanup(ctx);

      // Remove from session and order
      delete ctx.session.activeSubScenes[instanceId];
      this.removeSceneFromOrder(ctx, instanceId);
    }
  }

  async routeCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<void> {
    logger.info(`🔄 Routing callback: ${callback}`);
    logger.info(`🔄 Active scenes:`, Object.keys(ctx.session.activeSubScenes));

    // Check if callback contains scene instanceId (format: "sceneId:action")
    if (callback.includes(":")) {
      const [sceneInstanceId, action] = callback.split(":", 2);
      logger.info(`🔄 Extracted sceneId: ${sceneInstanceId}`);

      // Check if scene exists in current active scenes (within the 5 most recent)
      if (!ctx.session.activeSubScenes[sceneInstanceId]) {
        logger.info(`❌ Scene ${sceneInstanceId} not found in active scenes`);
        await ctx.reply(
          "👒 You are using an old version of the bot! Type in or tap /start to use the new version."
        );
        return;
      }

      // Route directly to the specific scene
      const sceneState = ctx.session.activeSubScenes[sceneInstanceId];
      if (sceneState && sceneState.active) {
        logger.info(
          `🔄 Routing directly to scene: ${sceneState.name} (${sceneInstanceId})`
        );
        const scene = await this.createSceneInstance(
          sceneState.name,
          sceneInstanceId
        );
        const handled = await scene.handleCallback(ctx, callback);
        logger.info(`🔄 Scene ${sceneState.name} handled: ${handled}`);
        if (!handled) {
          logger.info(
            `❌ Scene ${sceneInstanceId} couldn't handle its own callback: ${callback}`
          );
        }
        return;
      }
    }

    // Fallback: Route to active scenes in FIFO order for callbacks without instanceId
    const reversedOrder = [...ctx.session.sceneOrder].reverse();
    for (const instanceId of reversedOrder) {
      const sceneState = ctx.session.activeSubScenes[instanceId];
      if (sceneState && sceneState.active) {
        logger.info(`🔄 Trying scene: ${sceneState.name} (${instanceId})`);
        // Create scene instance dynamically
        const scene = await this.createSceneInstance(
          sceneState.name,
          instanceId
        );
        const handled = await scene.handleCallback(ctx, callback);
        logger.info(`🔄 Scene ${sceneState.name} handled: ${handled}`);
        if (handled) {
          return; // Stop routing once handled
        }
      }
    }

    logger.info(`❌ Unhandled callback: ${callback}`);
  }

  async routeText(ctx: GlobalSceneContext, text: string): Promise<void> {
    logger.info(`🔄 Routing text: "${text}"`);
    logger.info(
      `🔄 Active scenes count: ${
        Object.keys(ctx.session.activeSubScenes).length
      }`
    );

    // First priority: Find scenes that are waiting for text input (have editField)
    for (const [instanceId, sceneState] of Object.entries(
      ctx.session.activeSubScenes
    )) {
      if (
        sceneState &&
        sceneState.active &&
        (sceneState.data as any)?.editField
      ) {
        logger.info(
          `🎯 Found scene waiting for text input: ${
            sceneState.name
          } (${instanceId}) - editField: ${JSON.stringify(
            (sceneState.data as any).editField
          )}`
        );

        // Create scene instance dynamically
        const scene = await this.createSceneInstance(
          sceneState.name,
          instanceId
        );
        const handled = await scene.handleText(ctx, text);
        logger.info(`🔄 Scene ${sceneState.name} handled text: ${handled}`);
        if (handled) {
          return; // Stop routing once handled
        }
      }
    }

    // Fallback: Route to active scenes in FIFO order (most recent first)
    const reversedOrder = [...ctx.session.sceneOrder].reverse();
    for (const instanceId of reversedOrder) {
      const sceneState = ctx.session.activeSubScenes[instanceId];
      if (
        sceneState &&
        sceneState.active &&
        !(sceneState.data as any)?.editField
      ) {
        logger.info(
          `🔄 Trying text route to scene: ${sceneState.name} (${instanceId})`
        );
        logger.info(`🔄 Scene state data: ${JSON.stringify(sceneState.data)}`);

        // Create scene instance dynamically
        const scene = await this.createSceneInstance(
          sceneState.name,
          instanceId
        );
        const handled = await scene.handleText(ctx, text);
        logger.info(`🔄 Scene ${sceneState.name} handled text: ${handled}`);
        if (handled) {
          return; // Stop routing once handled
        }
      }
    }

    logger.info(`❌ Unhandled text: ${text}`);
  }

  // FIFO Scene Management
  private async addSceneToOrder(
    ctx: GlobalSceneContext,
    instanceId: string
  ): Promise<void> {
    // Add to the end of the order
    ctx.session.sceneOrder.push(instanceId);

    // If we exceed the limit, remove both from active map and scenes map
    while (ctx.session.sceneOrder.length > this.MAX_SCENES_PER_USER) {
      const oldestSceneId = ctx.session.sceneOrder.shift();
      if (oldestSceneId && ctx.session.activeSubScenes[oldestSceneId]) {
        logger.info(`Removing oldest scene completely: ${oldestSceneId}`);

        // Remove from active map (no more scenes map to clean)
        delete ctx.session.activeSubScenes[oldestSceneId];
      }
    }
  }

  private removeSceneFromOrder(
    ctx: GlobalSceneContext,
    instanceId: string
  ): void {
    const index = ctx.session.sceneOrder.indexOf(instanceId);
    if (index > -1) {
      ctx.session.sceneOrder.splice(index, 1);
    }
  }
}
