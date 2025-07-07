import { BaseSubScene, GlobalSceneContext, SceneData } from "@types";
import { BuyEventServices } from "./BuyEventServices";
import { CB } from "./callbacks";
import { GENERIC_ERRORS } from "@texts";
import { logger } from "@logger";
import { AddressValidator, validateImageDimensions } from "@utils";
import { buyEventStateService, BuyEventState } from "./BuyEventStateService";

export class BuyEventSubScene extends BaseSubScene<any> {
  private services: BuyEventServices;

  constructor(instanceId: string) {
    super(instanceId, "BuyEvent");
    this.services = new BuyEventServices(instanceId);
    console.log(`[BuyEventSubScene] Created new instance: ${instanceId}`);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    console.log(`[BuyEventSubScene] Activating instance: ${this.instanceId}`);
    this.log("info", ctx, "Activating BuyEvent scene");

    // Check if user is admin in group
    if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
      // Check if user is admin
      const isAdmin = await this.services.checkIfUserIsAdmin(ctx);
      if (!isAdmin) {
        await ctx.reply("❌ Only group administrators can create buy events.");
        await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
        return;
      }

      // Check if user is creating an event
      if (ctx.session.creatingEvent === true) {
        await ctx.reply(
          "❌ You are already creating an event. Use /cancelcreation to cancel the current event first."
        );
        await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
        return;
      }

      // Check if there's already an active BuyEvent scene in this group
      const groupChatId = ctx.chat.id.toString();
      const existingEvent = await this.services.getActiveGroupEvent(
        ctx,
        groupChatId
      );

      if (existingEvent) {
        await ctx.reply("❌ There's already an active buy event in progress.");
        await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
        return;
      }

      // Update session data
      ctx.session.buyEventSceneInstanceId = this.instanceId;
      ctx.session.creatingEvent = true;

      // Start the wizard flow
      await this.startWizard(ctx);
    }
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    // Handle wizard-specific callbacks
    if (callback === CB.cancel_creation) {
      // Answer callback query and delete confirmation message
      await ctx.answerCbQuery();
      if (ctx.callbackQuery?.message?.message_id) {
        try {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        } catch (error) {
          this.log(
            "debug",
            ctx,
            `Failed to delete confirmation message: ${error}`
          );
        }
      }
      await this.cancelWizard(ctx);
      return true;
    }

    if (callback === CB.confirm_event) {
      // Answer callback query and delete confirmation message
      await ctx.answerCbQuery();
      if (ctx.callbackQuery?.message?.message_id) {
        try {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        } catch (error) {
          this.log(
            "debug",
            ctx,
            `Failed to delete confirmation message: ${error}`
          );
        }
      }
      await this.confirmEvent(ctx);
      return true;
    }

    return false;
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `Handling text: ${text}`);

    // Use custom state service instead of session to avoid context issues
    const chatId = ctx.chat?.id;
    if (!chatId) {
      this.log("error", ctx, "No chat ID available");
      return false;
    }

    const state = (await buyEventStateService.getState(
      chatId,
      this.instanceId
    )) || {
      step: 1,
      tempMessageIds: [],
    };
    const currentStep = state.step;

    this.log(
      "debug",
      ctx,
      `Current step: ${currentStep}, instanceId: ${this.instanceId}`
    );
    this.log("debug", ctx, `State data: ${JSON.stringify(state)}`);

    // Log all active scenes for debugging
    if (ctx.session?.activeSubScenes) {
      const activeScenes = Object.keys(ctx.session.activeSubScenes);
      this.log("debug", ctx, `All active scenes: ${activeScenes.join(", ")}`);
    }

    // Check for cancel command in any step
    if (text.toLowerCase() === "/cancelcreation") {
      await this.cancelWizard(ctx);
      return true;
    }

    // Handle wizard flow based on current step
    switch (currentStep) {
      case 1:
        this.log("debug", ctx, "Processing step 1: Name input");
        return await this.handleNameInput(ctx, text);
      case 2:
        this.log("debug", ctx, "Processing step 2: Image input");
        // If we receive text in step 2, it means user sent text instead of image
        if (text.trim() !== "") {
          this.log("debug", ctx, "Received text instead of image in step 2");
          await this.remindCurrentStep(ctx);
          return true;
        }
        // If text is empty, it might be a photo message
        return await this.handleImageInput(ctx);
      case 3:
        this.log("debug", ctx, "Processing step 3: Token address input");
        return await this.handleTokenAddressInput(ctx, text);
      case 4:
        this.log("debug", ctx, "Processing step 4: Confirmation");
        // In step 4, we're waiting for confirmation via callback
        await this.remindCurrentStep(ctx);
        return true;
      default:
        this.log("debug", ctx, `Unknown step: ${state.step}`);
        return false;
    }
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up BuyEvent scene");

    // Clean up temp messages
    await this.cleanupTempMessages(ctx);

    // Clean up main message
    await this.cleanupMainMessage(ctx);

    // Clean up custom state
    const chatId = ctx.chat?.id;
    if (chatId) {
      await buyEventStateService.deleteState(chatId, this.instanceId);
    }

    // Reset creating event flag
    ctx.session.creatingEvent = false;
    ctx.session.buyEventSceneInstanceId = undefined;
  }

  // Private methods for wizard flow
  private async startWizard(ctx: GlobalSceneContext): Promise<void> {
    const sent = await ctx.reply(
      "What's the event name, dear? 🧵\n\n" +
        "Type /cancelcreation at any time to abort this wizard."
    );

    const chatId = ctx.chat?.id;
    if (chatId) {
      await buyEventStateService.updateState(chatId, this.instanceId, {
        step: 1,
        tempMessageIds: [sent.message_id],
      });
    }
  }

  private async handleNameInput(
    ctx: GlobalSceneContext,
    text: string
  ): Promise<boolean> {
    // Validate name
    if (text.length < 3 || text.length > 50) {
      const err = await ctx.reply(
        "Event name must be between 3 and 50 characters."
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }

    // Store name and move to next step
    const chatId = ctx.chat?.id;
    if (chatId) {
      await buyEventStateService.updateState(chatId, this.instanceId, {
        step: 2,
        name: text,
      });
      this.log("debug", ctx, `Updated state to step 2, name: ${text}`);

      const sent = await ctx.reply(
        "Now send the banner image, sweetie (1280x360 recommended) 🖼️\n\n" +
          "Type /cancelcreation to abort."
      );

      // Add temp message IDs
      const currentState = await buyEventStateService.getState(
        chatId,
        this.instanceId
      );
      const tempIds = [
        ...(currentState?.tempMessageIds || []),
        ctx.message?.message_id!,
        sent.message_id,
      ];
      await buyEventStateService.updateState(chatId, this.instanceId, {
        tempMessageIds: tempIds,
      });
    }

    return true;
  }

  private async handleImageInput(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("debug", ctx, "handleImageInput called");

    // Check if it's a photo
    if (!ctx.message || !("photo" in ctx.message)) {
      this.log("debug", ctx, "No photo in message, calling remindCurrentStep");
      await this.remindCurrentStep(ctx);
      return true;
    }

    const photo = ctx.message.photo?.pop();
    if (!photo) {
      const err = await ctx.reply("Need a proper image, kiddo. ❌");
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }

    // Validate image dimensions
    try {
      const validation = await validateImageDimensions(
        ctx.telegram,
        photo.file_id,
        1200,
        1400,
        300,
        400,
        3.5,
        0.3
      );

      if (!validation.isValid) {
        this.log(
          "info",
          ctx,
          `Image validation failed: ${JSON.stringify(validation)}`
        );
        let errorMessage = "Sorry kiddo, this image will not fit. ";
        errorMessage += "Try around 1280x360. 🖼️";
        const err = await ctx.reply(errorMessage);
        this.addTempMessageId(ctx, err.message_id);
        return true;
      }

      this.log(
        "info",
        ctx,
        "Image validated successfully, proceeding to token address"
      );
    } catch (error) {
      this.log("error", ctx, `Error validating image: ${error}`);
      const err = await ctx.reply(
        "Error processing image. Please try again or type /cancelcreation."
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }

    // Store image and move to next step using custom state service
    const chatId = ctx.chat?.id;
    if (chatId) {
      await buyEventStateService.updateState(chatId, this.instanceId, {
        step: 3,
        bannerFileId: photo.file_id,
      });
      this.log(
        "debug",
        ctx,
        `Updated state to step 3, bannerFileId: ${photo.file_id}`
      );

      const sent = await ctx.reply(
        "Token address, please? 🔍\n\n" + "Type /cancelcreation to abort."
      );

      // Add temp message IDs
      const currentState = await buyEventStateService.getState(
        chatId,
        this.instanceId
      );
      const tempIds = [
        ...(currentState?.tempMessageIds || []),
        ctx.message.message_id,
        sent.message_id,
      ];
      await buyEventStateService.updateState(chatId, this.instanceId, {
        tempMessageIds: tempIds,
      });

      this.log("info", ctx, `Moved to step 3, bannerFileId: ${photo.file_id}`);

      const updatedState = await buyEventStateService.getState(
        chatId,
        this.instanceId
      );
      logger.info(
        `[BuyEventSubScene] Updated state: ${JSON.stringify(updatedState)}`
      );
    }

    return true;
  }

  private async handleTokenAddressInput(
    ctx: GlobalSceneContext,
    text: string
  ): Promise<boolean> {
    this.log("debug", ctx, "handleTokenAddressInput called");
    this.log("info", ctx, `Processing token address input: "${text}"`);

    const chatId = ctx.chat?.id;
    if (!chatId) {
      this.log("error", ctx, "No chat ID available");
      return false;
    }

    // Validate address
    const address = AddressValidator.parseEthereumAddress(text.trim());
    if (!address) {
      const err = await ctx.reply(
        "Not a valid address, kiddo. Try again ❌ or type /cancelcreation to abort."
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }

    this.log("info", ctx, `Valid address found: ${address}`);

    // Check if token exists in whitelist
    try {
      const tokens =
        await ctx.services.feeWhitelistService.getAllTokenWhitelist(ctx);
      const token = tokens?.find(
        (t) => t.address.toLowerCase() === address.toLowerCase()
      );

      if (!token) {
        const err = await ctx.reply("Token not in my books, dear. ❌");
        this.addTempMessageId(ctx, err.message_id);
        return true;
      }

      this.log("info", ctx, `Token found in whitelist: ${token.symbol}`);

      // Store token and show confirmation using custom state service
      await buyEventStateService.updateState(chatId, this.instanceId, {
        step: 4,
        tokenId: token.id,
      });
      this.log("debug", ctx, `Updated state to step 4, tokenId: ${token.id}`);

      // Get current state from custom service
      const currentState = await buyEventStateService.getState(
        chatId,
        this.instanceId
      );
      const summary = `✅ <b>Ready to launch your buy event?</b>
I'm about to start a buying event for <b>${token.symbol}</b> called "${currentState?.name}"!
<code>${token.address}</code>.
      `;

      const summaryMsg = await ctx.replyWithHTML(summary, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Start Event 🚀", callback_data: CB.confirm_event },
              { text: "Dismiss ❌", callback_data: CB.cancel_creation },
            ],
          ],
        },
      });

      this.addTempMessageId(ctx, summaryMsg.message_id);
      this.log("info", ctx, `Moved to step 4, showing confirmation`);
      return true;
    } catch (error) {
      this.log("error", ctx, `Error fetching token: ${error}`);
      const err = await ctx.reply(
        "Error checking token. Please try again or type /cancelcreation."
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }
  }

  private async confirmEvent(ctx: GlobalSceneContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      await ctx.reply("Error: Could not determine group chat ID.");
      await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
      return;
    }

    const state = await buyEventStateService.getState(chatId, this.instanceId);
    if (!state || !state.name || !state.bannerFileId || !state.tokenId) {
      await ctx.reply("Missing information. Event creation cancelled.");
      await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
      return;
    }

    try {
      // Get user ID for event creation
      const userId = await ctx.services.userService.getUserByTgId(
        ctx.from!.id.toString()
      );

      if (!userId) {
        await ctx.reply("Error: Could not determine user ID.");
        await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
        return;
      }

      // Create the event in the database
      const event = await ctx.services.buyEventService.createBuyEvent(
        state.name,
        state.bannerFileId,
        state.tokenId,
        chatId.toString(),
        userId.id
      );

      this.log("info", ctx, `Event created successfully with ID: ${event.id}`);

      // Clean up temp messages
      await this.cleanupTempMessages(ctx);

      // Send final confirmation
      await ctx.replyWithPhoto(state.bannerFileId, {
        caption:
          `🎉 <b>Buy Event Started!</b> 🚀\n\n` +
          `Launched the "${state.name}" buying event!\n\n` +
          `🏆 The leaderboard is now active!\n` +
          `Use /leaderboard@${ctx.botInfo?.username} 💰`,
        parse_mode: "HTML",
      });
    } catch (error) {
      this.log("error", ctx, `Error creating event: ${error}`);
      await ctx.reply("Error creating event. Please try again later.");
    }

    // Reset creating event flag
    ctx.session.creatingEvent = false;
    ctx.session.buyEventSceneInstanceId = undefined;

    // Remove scene from GlobalSceneManager
    await ctx.sceneManager.deactivateScene(ctx, this.instanceId);

    return this.cleanup(ctx);
  }

  private async cancelWizard(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "User cancelled event creation");

    const chatId = ctx.chat?.id;
    let cancelMessage = "❌ <b>Event Creation Cancelled</b>\n\n";

    if (chatId) {
      const state = await buyEventStateService.getState(
        chatId,
        this.instanceId
      );
      if (state?.name) {
        cancelMessage += `📝 Event name: "${state.name}"\n`;
      }
      if (state?.bannerFileId) {
        cancelMessage += `🖼️ Banner image: Uploaded\n`;
      }
      if (state?.tokenId) {
        cancelMessage += `🔗 Token: Selected\n`;
      }
    }

    await ctx.replyWithHTML(cancelMessage);

    // Reset creating event flag
    ctx.session.creatingEvent = false;
    ctx.session.buyEventSceneInstanceId = undefined;

    // Remove scene from GlobalSceneManager
    await ctx.sceneManager.deactivateScene(ctx, this.instanceId);

    return this.cleanup(ctx);
  }

  private async remindCurrentStep(
    ctx: GlobalSceneContext,
    isCommand = false
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    let reminderMessage = isCommand
      ? "Sorry, I can't process that command right now because you're in the middle of creating a buy event. "
      : "You're in the middle of creating a buy event. ";

    let currentStep = 1;
    if (chatId) {
      const state = await buyEventStateService.getState(
        chatId,
        this.instanceId
      );
      currentStep = state?.step || 1;
    }

    switch (currentStep) {
      case 1:
        reminderMessage += "Please provide a name for the event:";
        break;
      case 2:
        reminderMessage += "Please send a banner image (1280x360 recommended):";
        break;
      case 3:
        reminderMessage += "Please provide the token address:";
        break;
      case 4:
        reminderMessage += "Please confirm or cancel the event creation:";
        break;
      default:
        reminderMessage +=
          "Please complete the current step or type /cancelcreation to abort.";
    }

    reminderMessage +=
      "\n\nType /cancelcreation if you want to abort the event creation.";

    const sent = await ctx.reply(reminderMessage);
    this.addTempMessageId(ctx, sent.message_id);
  }
}
