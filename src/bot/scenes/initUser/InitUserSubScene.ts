import { BaseSubScene, GlobalSceneContext, InitUserSceneData } from "@types";
import { INITUSER_TEXTS } from "./messages";
import { CALLBACKS, createInitUserCallback } from "./callbacks";
import { InitUserServices } from "./InitUserServices";

export class InitUserSubScene extends BaseSubScene<InitUserSceneData> {
  private services: InitUserServices;

  constructor(instanceId: string) {
    super(instanceId, "InitUser");
    this.services = new InitUserServices(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating InitUser scene");
    this.log(
      "debug",
      ctx,
      `Active scenes: ${Object.keys(ctx.session.activeSubScenes).join(", ")}`
    );

    try {
      // Initialize scene data
      const sceneData: InitUserSceneData = {
        step: "creating_wallet",
      };

      // Update session data
      this.updateSceneData(ctx, sceneData);

      // Start the init user flow
      const wallet = await this.services.createWallet(ctx);
      this.log("info", ctx, `Wallet created: ${wallet.address}`);

      // Update step
      this.updateSceneData(ctx, { step: "wallet_created" });

      // Show private key message
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

      // Store message ID and wallet address for later use
      this.updateSceneData(ctx, {
        pkMessageId: message.message_id,
        walletAddress: wallet.address,
      });

      this.log("info", ctx, "Private key message displayed");
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error during activation: ${
          error instanceof Error ? error.stack : error
        }`
      );
      await ctx.reply(
        "❌ An error occurred during initialization. Please try again."
      );
    }
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up InitUser scene");

    // Call parent cleanup for temp messages
    await super.cleanup(ctx);

    // Clean up private key message if it exists
    const sceneData = this.getSceneData(ctx);
    if (sceneData.pkMessageId) {
      try {
        await ctx.deleteMessage(sceneData.pkMessageId);
      } catch (error) {
        this.log("debug", ctx, "Failed to delete private key message");
      }
    }
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    // Validate callback belongs to this instance
    const validation = this.validateCallbackInstanceId(callback);
    if (!validation) {
      this.log("debug", ctx, `InstanceId mismatch, skipping`);
      return false;
    }

    const { action } = validation;
    this.log("info", ctx, `Processing action: ${action}`);

    try {
      switch (action) {
        case CALLBACKS.CONFIRM_PRIVATE_KEY:
          return await this.handleConfirmPrivateKey(ctx);
        default:
          this.log("warn", ctx, `Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      await this.handleCallbackError(ctx, action, error);
      return true; // We handled it, even if there was an error
    }
  }

  private async handleConfirmPrivateKey(
    ctx: GlobalSceneContext
  ): Promise<boolean> {
    this.log("info", ctx, "Handling private key confirmation");

    try {
      // Answer the callback query first
      await ctx.answerCbQuery("✅ Private key confirmed!");

      const sceneData = this.getSceneData(ctx);

      // Delete the private key message
      if (sceneData.pkMessageId) {
        await ctx.deleteMessage(sceneData.pkMessageId);
      }

      // Update step
      this.updateSceneData(ctx, { step: "private_key_confirmed" });

      // Show wallet address confirmation
      await ctx.reply(
        INITUSER_TEXTS.FUNCTIONS.getNewWalletKeyMessage(
          sceneData.walletAddress as `0x${string}`
        ),
        {
          parse_mode: "HTML",
        }
      );

      // Show welcome message
      await ctx.reply(INITUSER_TEXTS.MESSAGES.WELCOME);

      // Complete InitUser flow using services
      await this.services.completeInitUser(ctx);

      return true;
    } catch (error) {
      this.log(
        "error",
        ctx,
        `Error confirming private key: ${
          error instanceof Error ? error.stack : error
        }`
      );
      await ctx.answerCbQuery(
        "❌ Error confirming private key. Please try again."
      );
      return true;
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `Handling text: ${text}`);
    // InitUser doesn't handle text messages
    return false;
  }
}
