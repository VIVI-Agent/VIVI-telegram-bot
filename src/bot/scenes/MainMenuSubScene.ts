import { ISubScene, GlobalSceneContext, MainMenuSceneData } from "../types";

export class MainMenuSubScene implements ISubScene {
  instanceId: string;
  name: string = "MainMenu";

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    console.log(`MainMenuSubScene activated: ${this.instanceId}`);

    // Initialize scene data
    const sceneData: MainMenuSceneData = {
      menuMessageId: undefined,
    };

    // Update session data
    ctx.session.activeSubScenes[this.instanceId].data = sceneData;

    // Show main menu
    await this.showMainMenu(ctx);
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    console.log(`MainMenuSubScene cleanup: ${this.instanceId}`);

    // Clean up any temporary messages
    const sceneState = ctx.session.activeSubScenes[this.instanceId];
    if (sceneState?.tempMessageIds) {
      for (const messageId of sceneState.tempMessageIds) {
        try {
          await ctx.deleteMessage(messageId);
        } catch (error) {
          console.log(`Failed to delete message ${messageId}:`, error);
        }
      }
    }

    // Clean up main menu message
    const sceneData = sceneState?.data as MainMenuSceneData;
    if (sceneData?.menuMessageId) {
      try {
        await ctx.deleteMessage(sceneData.menuMessageId);
      } catch (error) {
        console.log(`Failed to delete menu message:`, error);
      }
    }
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    console.log(`MainMenuSubScene handling callback: ${callback}`);

    // Extract action from callback (format: "instanceId:action")
    let action = callback;
    if (callback.includes(":")) {
      const [instanceId, callbackAction] = callback.split(":", 2);
      // Only handle callbacks for this scene instance
      if (instanceId !== this.instanceId) {
        return false;
      }
      action = callbackAction;
    }

    // Handle main menu callbacks
    switch (action) {
      case "buy":
        await ctx.answerCbQuery("🚀 Buy feature coming soon!");
        return true;

      case "sell":
        await ctx.answerCbQuery("💰 Sell feature coming soon!");
        return true;

      case "portfolio":
        await ctx.answerCbQuery("📊 Portfolio feature coming soon!");
        return true;

      case "settings":
        await ctx.answerCbQuery("⚙️ Settings feature coming soon!");
        return true;

      case "refresh_menu":
        await this.refreshMainMenu(ctx);
        return true;

      default:
        return false; // Not handled
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    console.log(`MainMenuSubScene handling text: ${text}`);

    // Handle text commands
    switch (text.toLowerCase()) {
      case "/start":
      case "/menu":
        await this.showMainMenu(ctx);
        return true;

      default:
        return false; // Not handled
    }
  }

  // Private methods for MainMenu logic
  private async showMainMenu(ctx: GlobalSceneContext): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🚀 Buy", callback_data: `${this.instanceId}:buy` },
          { text: "💰 Sell", callback_data: `${this.instanceId}:sell` },
        ],
        [
          {
            text: "📊 Portfolio",
            callback_data: `${this.instanceId}:portfolio`,
          },
          { text: "⚙️ Settings", callback_data: `${this.instanceId}:settings` },
        ],
        [
          {
            text: "🔄 Refresh",
            callback_data: `${this.instanceId}:refresh_menu`,
          },
        ],
      ],
    };

    const message = `
🤖 **VIVI Bot - Main Menu**

Welcome! Choose an option below:

• 🚀 **Buy** - Purchase tokens
• 💰 **Sell** - Sell your tokens  
• 📊 **Portfolio** - View your holdings
• ⚙️ **Settings** - Bot configuration
    `;

    try {
      const sentMessage = await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });

      // Store menu message ID
      const sceneData = ctx.session.activeSubScenes[this.instanceId]
        .data as MainMenuSceneData;
      sceneData.menuMessageId = sentMessage.message_id;
    } catch (error) {
      console.error("Error showing main menu:", error);
      await ctx.reply("❌ Error showing menu. Please try again.");
    }
  }

  private async refreshMainMenu(ctx: GlobalSceneContext): Promise<void> {
    try {
      await ctx.answerCbQuery("🔄 Refreshing menu...");

      const sceneData = ctx.session.activeSubScenes[this.instanceId]
        .data as MainMenuSceneData;

      // Delete old menu if exists
      if (sceneData.menuMessageId) {
        try {
          await ctx.deleteMessage(sceneData.menuMessageId);
        } catch (error) {
          console.log("Could not delete old menu message:", error);
        }
      }

      // Show new menu
      await this.showMainMenu(ctx);
    } catch (error) {
      console.error("Error refreshing main menu:", error);
      await ctx.answerCbQuery("❌ Error refreshing menu");
    }
  }
}
