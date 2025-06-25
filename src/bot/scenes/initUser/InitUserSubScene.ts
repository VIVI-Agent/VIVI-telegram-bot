import { ISubScene, GlobalSceneContext, InitUserSceneData } from "../../types";
import { CALLBACKS, createInitUserCallback } from "./callbacks";
import { createWallet } from "./InitUserServices";
import { INITUSER_TEXTS } from "./messages";

export class InitUserSubScene implements ISubScene {
  instanceId: string;
  name: string = "InitUser";

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    console.log(`InitUserSubScene activated: ${this.instanceId}`);
    console.log(`Active scenes:`, Object.keys(ctx.session.activeSubScenes));

    // Initialize scene data
    const sceneData: InitUserSceneData = {
      step: "creating_wallet",
    };

    // Update session data
    ctx.session.activeSubScenes[this.instanceId].data = sceneData;

    // Start the init user flow
    const wallet = await createWallet(ctx);
    console.log(`Wallet created: ${wallet.address}`);

    sceneData.step = "wallet_created";
    ctx.session.activeSubScenes[this.instanceId].data = sceneData;

    const message = await ctx.reply(
      INITUSER_TEXTS.FUNCTIONS.getPrivateKeyMessage(
        wallet.address,
        wallet.privateKey
      ),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: INITUSER_TEXTS.MESSAGES.CONFIRM_AND_DELETE_PK,
                callback_data: createInitUserCallback(
                  this.instanceId,
                  CALLBACKS.CONFIRM_PRIVATE_KEY
                ),
              },
            ],
          ],
        },
      }
    );
    sceneData.pkMessageId = message.message_id;
    sceneData.walletAddress = wallet.address;
    ctx.session.activeSubScenes[this.instanceId].data = sceneData;
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    console.log(`InitUserSubScene handling callback: ${callback}`);
    console.log(`My instanceId: ${this.instanceId}`);

    const [instanceId, action] = callback.split(":");
    console.log(`Extracted: instanceId=${instanceId}, action=${action}`);

    if (instanceId !== this.instanceId) {
      console.log(`InstanceId mismatch, skipping`);
      return false;
    }

    switch (action) {
      case CALLBACKS.CONFIRM_PRIVATE_KEY:
        console.log(`Handling CONFIRM_PRIVATE_KEY`);
        return this.handleConfirmPrivateKey(ctx, callback);
      default:
        console.log(`Unknown action: ${action}`);
        return false;
    }
  }

  private async handleConfirmPrivateKey(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    console.log(`InitUserSubScene handling confirm private key: ${callback}`);

    // Answer the callback query first
    await ctx.answerCbQuery("✅ Private key confirmed!");

    const sceneData = ctx.session.activeSubScenes[this.instanceId]
      .data as InitUserSceneData;
    await ctx.deleteMessage(sceneData.pkMessageId);
    sceneData.step = "private_key_confirmed";
    ctx.session.activeSubScenes[this.instanceId].data = sceneData;

    await ctx.reply(
      INITUSER_TEXTS.FUNCTIONS.getNewWalletKeyMessage(
        sceneData.walletAddress as `0x${string}`
      )
    );
    await ctx.reply(INITUSER_TEXTS.MESSAGES.WELCOME);

    return true;
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    console.log(`InitUserSubScene handling text: ${text}`);
    return false;
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    console.log(`InitUserSubScene cleanup: ${this.instanceId}`);
  }
}
