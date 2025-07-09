import { BaseSubScene, GlobalSceneContext } from "@types";
import { BuyEventServices } from "./BuyEventServices";
import { CB } from "./callbacks";
import { GENERIC_ERRORS } from "@texts";
import { logger } from "@logger";
import { AddressValidator, validateImageDimensions } from "@utils";
import { BuyEventSceneData } from "@types";

export class BuyEventSubScene extends BaseSubScene<BuyEventSceneData> {
  private services: BuyEventServices;

  constructor(instanceId: string) {
    super(instanceId, "BuyEvent");
    this.services = new BuyEventServices(instanceId);
    console.log(`[BuyEventSubScene] Created new instance: ${instanceId}`);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    console.log(`[BuyEventSubScene] Activating instance: ${this.instanceId}`);
    this.log("info", ctx, "Activating BuyEvent scene");

    // Initialize scene data
    const sceneData: BuyEventSceneData = {
      step: 1,
      tempMessageIds: [],
    };
    this.updateSceneData(ctx, sceneData);

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

    // Get scene data from memory session
    const sceneData = this.getSceneData(ctx);
    const currentStep = sceneData.step;

    this.log(
      "debug",
      ctx,
      `Current step: ${currentStep}, instanceId: ${this.instanceId}`
    );
    this.log("debug", ctx, `State data: ${JSON.stringify(sceneData)}`);

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
        this.log("debug", ctx, `Unknown step: ${sceneData.step}`);
        return false;
    }
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up BuyEvent scene");

    // Reset creating event flag
    ctx.session.creatingEvent = false;
    ctx.session.buyEventSceneInstanceId = undefined;

    // Parent cleanup will handle scene data removal and temp message cleanup
    await super.cleanup(ctx);
  }

  // Private methods for wizard flow
  private async startWizard(ctx: GlobalSceneContext): Promise<void> {
    const sent = await ctx.reply(
      "What's the event name, dear? 🧵\n\n" +
        "Type /cancelcreation at any time to abort this wizard.",
      {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Enter event name...",
        },
      }
    );

    const sceneData = this.getSceneData(ctx);
    sceneData.step = 1;
    sceneData.tempMessageIds = [sent.message_id];
    this.updateSceneData(ctx, sceneData);
  }

  private async handleNameInput(
    ctx: GlobalSceneContext,
    text: string
  ): Promise<boolean> {
    // Validate name
    if (text.length < 3 || text.length > 50) {
      const err = await ctx.reply(
        "Event name must be between 3 and 50 characters.",
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Enter event name...",
          },
        }
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }

    // Store name and move to next step
    const sceneData = this.getSceneData(ctx);
    sceneData.step = 2;
    sceneData.name = text;
    this.log("debug", ctx, `Updated state to step 2, name: ${text}`);

    const sent = await ctx.reply(
      "Now send the banner image, sweetie (1280x360 recommended) 🖼️\n\n" +
        "Type /cancelcreation to abort.",
      {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Send banner image...",
        },
      }
    );

    // Add temp message IDs
    this.addTempMessageId(ctx, ctx.message?.message_id!);
    this.addTempMessageId(ctx, sent.message_id);

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
      const err = await ctx.reply("Need a proper image, kiddo. ❌", {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Send banner image...",
        },
      });
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
        const err = await ctx.reply(errorMessage, {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Send banner image...",
          },
        });
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
        "Error processing image. Please try again or type /cancelcreation.",
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Send banner image...",
          },
        }
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }

    // Store image and move to next step using scene data
    const sceneData = this.getSceneData(ctx);
    sceneData.step = 3;
    sceneData.bannerFileId = photo.file_id;
    this.log(
      "debug",
      ctx,
      `Updated state to step 3, bannerFileId: ${photo.file_id}`
    );

    const sent = await ctx.reply(
      "Token address, please? 🔍\n\n" + "Type /cancelcreation to abort.",
      {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Enter token address...",
        },
      }
    );

    // Add temp message IDs
    this.addTempMessageId(ctx, ctx.message.message_id);
    this.addTempMessageId(ctx, sent.message_id);

    this.log("info", ctx, `Moved to step 3, bannerFileId: ${photo.file_id}`);

    logger.info(
      `[BuyEventSubScene] Updated state: ${JSON.stringify(sceneData)}`
    );

    return true;
  }

  private async handleTokenAddressInput(
    ctx: GlobalSceneContext,
    text: string
  ): Promise<boolean> {
    this.log("debug", ctx, "handleTokenAddressInput called");
    this.log("info", ctx, `Processing token address input: "${text}"`);

    // Validate address
    const address = AddressValidator.parseEthereumAddress(text.trim());
    if (!address) {
      const err = await ctx.reply(
        "Not a valid address, kiddo. Try again ❌ or type /cancelcreation to abort.",
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Enter token address...",
          },
        }
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
        const err = await ctx.reply("Token not in my books, dear. ❌", {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Enter token address...",
          },
        });
        this.addTempMessageId(ctx, err.message_id);
        return true;
      }

      this.log("info", ctx, `Token found in whitelist: ${token.symbol}`);

      // Store token and show confirmation using scene data
      const sceneData = this.getSceneData(ctx);
      sceneData.step = 4;
      sceneData.tokenId = token.id;
      this.log("debug", ctx, `Updated state to step 4, tokenId: ${token.id}`);

      const summary = `✅ <b>Ready to launch your buy event?</b>
I'm about to start a buying event for <b>${token.symbol}</b> called "${sceneData.name}"!
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
        "Error checking token. Please try again or type /cancelcreation.",
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Enter token address...",
          },
        }
      );
      this.addTempMessageId(ctx, err.message_id);
      return true;
    }
  }

  private async confirmEvent(ctx: GlobalSceneContext): Promise<void> {
    const sceneData = this.getSceneData(ctx);

    if (!sceneData.name || !sceneData.bannerFileId || !sceneData.tokenId) {
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

      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply("Error: Could not determine group chat ID.");
        await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
        return;
      }

      // Create the event in the database
      const event = await ctx.services.buyEventService.createBuyEvent(
        sceneData.name,
        sceneData.bannerFileId,
        sceneData.tokenId,
        chatId.toString(),
        userId.id
      );

      this.log("info", ctx, `Event created successfully with ID: ${event.id}`);

      // Clean up temp messages
      await this.cleanupTempMessages(ctx);

      // Send final confirmation
      await ctx.replyWithPhoto(sceneData.bannerFileId, {
        caption:
          `🎉 <b>Buy Event Started!</b> 🚀\n\n` +
          `Launched the "${sceneData.name}" buying event!\n\n` +
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

    const sceneData = this.getSceneData(ctx);
    let cancelMessage = "❌ <b>Event Creation Cancelled</b>\n\n";

    if (sceneData.name) {
      cancelMessage += `📝 Event name: "${sceneData.name}"\n`;
    }
    if (sceneData.bannerFileId) {
      cancelMessage += `🖼️ Banner image: Uploaded\n`;
    }
    if (sceneData.tokenId) {
      cancelMessage += `🔗 Token: Selected\n`;
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
    let reminderMessage = isCommand
      ? "Sorry, I can't process that command right now because you're in the middle of creating a buy event. "
      : "You're in the middle of creating a buy event. ";

    const sceneData = this.getSceneData(ctx);
    const currentStep = sceneData.step;

    let placeholder = "";
    switch (currentStep) {
      case 1:
        reminderMessage += "Please provide a name for the event:";
        placeholder = "Enter event name...";
        break;
      case 2:
        reminderMessage += "Please send a banner image (1280x360 recommended):";
        placeholder = "Send banner image...";
        break;
      case 3:
        reminderMessage += "Please provide the token address:";
        placeholder = "Enter token address...";
        break;
      case 4:
        reminderMessage += "Please confirm or cancel the event creation:";
        placeholder = "Use buttons above...";
        break;
      default:
        reminderMessage +=
          "Please complete the current step or type /cancelcreation to abort.";
        placeholder = "Follow instructions...";
    }

    reminderMessage +=
      "\n\nType /cancelcreation if you want to abort the event creation.";

    const sent = await ctx.reply(reminderMessage, {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: placeholder,
      },
    });

    this.addTempMessageId(ctx, sent.message_id);
  }
}
