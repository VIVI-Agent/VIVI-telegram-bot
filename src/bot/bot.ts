import { session, Telegraf } from "telegraf";
import { message } from "telegraf/filters";

import { redisStore, secrets, webhookServer } from "@config";
import { services } from "@domain";
import { GlobalSceneContext, GlobalSessionData } from "@types";

import { GlobalSceneManagerImpl } from "./core/GlobalSceneManager";

import { createAuthMiddleware } from "./middlewares/AuthMiddleware";
// import { Redis } from "@telegraf/session/redis"; // ← DISABLED - Using memory for now
import { logger } from "@logger";
import { GENERIC_ERRORS } from "@texts";
import { registerCommands } from "./commands";
import { textManager } from "./textHandlers";

// Create bot instance
const bot = new Telegraf<GlobalSceneContext>(secrets.TELEGRAM_BOT_TOKEN || "");

// Create global scene manager
const sceneManager = new GlobalSceneManagerImpl();

// ← REDIS DISABLED - Using memory storage
// const store = Redis<GlobalSessionData>({
//   url: redisStore.REDIS_STORE_URL,
//   config: { pingInterval: 30000 },
// });

// Session middleware with MEMORY storage
bot.use(
  session({
    // store, // ← DISABLED Redis store
    defaultSession: () => ({
      activeSubScenes: {},
      sceneOrder: [],
      version: "1.0.0",
    }),
  })
);

// Database Services and Scene Manager Injected
bot.use((ctx, next) => {
  ctx.services = services;
  ctx.sceneManager = sceneManager;
  return next();
});

// User context middleware (simplified)
bot.use(createAuthMiddleware);

// Start command - activate InitUser scene
bot.start(async (ctx) => {
  if (ctx.chat?.type === "private") {
    logger.info("Start command received");

    try {
      // Get Start Parameters for Trade Scene
      const startParams = ctx.message.text?.split(" ")[1];
      logger.info(`Start params: ${startParams}`);
      if (startParams) {
        // https://t.me/VIVIBaseBot?start=trade_sell_0x06e3685982b381ab7ecb760c8fbd7d92ac368a27
        const [action, mode, token] = startParams.split("_");
        if (action === "trade") {
          await sceneManager.activateScene(ctx, "Trade", { mode, token });
          return;
        }

        // Ignore any other params
      }

      // Check if user needs initialization based on wallet status
      if (!ctx.walletCreated) {
        logger.info("User has no wallet, activating InitUser scene");
        await sceneManager.activateScene(ctx, "InitUser");
      } else {
        logger.info("User has wallet, activating MainMenu scene");
        await sceneManager.activateScene(ctx, "MainMenu");
      }
    } catch (error) {
      logger.error("Error in start command:", error);
      await ctx.reply("❌ Error starting bot. Please try again.");
    }
  }
});

// Handle callbacks
bot.on("callback_query", async (ctx) => {
  const callbackQuery = ctx.callbackQuery;
  if (callbackQuery && "data" in callbackQuery) {
    const callback = callbackQuery.data;
    logger.info(`Callback received: ${callback}`);
    await sceneManager.routeCallback(ctx, callback);
  }
});

// Handle settings command
bot.command("settings", async (ctx) => {
  if (ctx.chat?.type === "private") {
    await sceneManager.activateScene(ctx, "Settings");
  }
});

// Handle wallets command
bot.command("wallets", async (ctx) => {
  if (ctx.chat?.type === "private") {
    await sceneManager.activateScene(ctx, "Wallets");
  }
});

// Handle referral command
bot.command("referral", async (ctx) => {
  if (ctx.chat?.type === "private") {
    await sceneManager.activateScene(ctx, "Referral");
  }
});

// Handle positions command
bot.command("positions", async (ctx) => {
  if (ctx.chat?.type === "private") {
    await sceneManager.activateScene(ctx, "Positions");
  }
});

// Handle trade command
bot.command("trade", async (ctx) => {
  if (ctx.chat?.type === "private") {
    await sceneManager.activateScene(ctx, "Trade");
  }
});

// Handle createbuyevent command (admin only in groups)
bot.command("createbuyevent", async (ctx) => {
  // Only allow in groups
  logger.info(`Creating buy event in ${ctx.chat?.type}`);
  logger.info(`creatingEvent ${ctx.session.creatingEvent}`);
  if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
    // Check if user is admin
    try {
      const admins = await ctx.getChatAdministrators();
      const isAdmin = admins.some((admin) => admin.user.id === ctx.from?.id);
      if (!isAdmin) {
        await ctx.reply("❌ Only group administrators can create buy events.");
        return;
      }
    } catch (error) {
      logger.error(`Error checking admin status: ${error}`);
      await ctx.reply("❌ Error checking admin permissions. Please try again.");
      return;
    }

    if (ctx.session.creatingEvent === true) {
      logger.info("User is already creating an event.");
      await ctx.reply(
        "❌ You are already creating an event. Use /cancelcreation to cancel the current event first."
      );
      return;
    }

    await sceneManager.activateScene(ctx, "BuyEvent");
  } else {
    await ctx.reply("❌ This command is only available in groups.");
  }
});

bot.command("cancelcreation", async (ctx) => {
  if (
    ctx.session.creatingEvent === true &&
    ctx.session.buyEventSceneInstanceId
  ) {
    logger.info(`Cancelling buy event creation for user ${ctx.from?.id}`);

    // Deactivate the scene
    await sceneManager.deactivateScene(
      ctx,
      ctx.session.buyEventSceneInstanceId
    );

    // Reset flags
    ctx.session.creatingEvent = false;
    ctx.session.buyEventSceneInstanceId = undefined;

    await ctx.reply("✅ Event creation cancelled successfully.");
  } else {
    await ctx.reply("❌ No event creation in progress to cancel.");
  }
});

// Handle closebuyevent command (admin only in groups)
bot.command("closebuyevent", async (ctx) => {
  const { CloseBuyEventCommandHandler } = await import(
    "./scenes/buyEvent/CloseBuyEventCommandHandler"
  );
  const handler = new CloseBuyEventCommandHandler();

  const canExecute = await handler.canExecute(ctx);
  if (canExecute) {
    await handler.execute(ctx);
  }
});

// Handle leaderboard command (groups only)
bot.command("leaderboard", async (ctx) => {
  const { LeaderboardCommandHandler } = await import(
    "./scenes/buyEvent/LeaderboardCommandHandler"
  );
  const handler = new LeaderboardCommandHandler();

  const canExecute = await handler.canExecute(ctx);
  if (canExecute) {
    await handler.execute(ctx);
  }
});

// Handle myeventstat command (groups only)
bot.command("myeventstat", async (ctx) => {
  const { MyEventStatCommandHandler } = await import(
    "./scenes/buyEvent/MyEventStatCommandHandler"
  );
  const handler = new MyEventStatCommandHandler();

  const canExecute = await handler.canExecute(ctx);
  if (canExecute) {
    await handler.execute(ctx);
  }
});

// Handle text messages and photos
bot.on(message("text"), async (ctx) => {
  // Skip All Commands
  if (ctx.message.text?.startsWith("/")) {
    return;
  }

  // Handle Text Messages In Private Chats (BOT DM)
  if (ctx.chat?.type === "private") {
    const text = ctx.message.text;

    logger.debug(`Text received: ${text}`);

    (async () => {
      try {
        await textManager.routeText(ctx, text);
      } catch (error) {
        logger.error("Error in textManager.routeText:", error);
      }
    })();

    (async () => {
      try {
        await sceneManager.routeText(ctx, text);
      } catch (error) {
        logger.error("Error in sceneManager.routeText:", error);
      }
    })();
    return;
  }
  // Handle Text Messages In Group Chats
  else if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
    const text = ctx.message.text;
    logger.debug(`Text received: ${text}`);

    // Handle scene routing in groups
    (async () => {
      try {
        await sceneManager.routeText(ctx, text);
      } catch (error) {
        logger.error("Error in sceneManager.routeText:", error);
      }
    })();

    // Handle text manager routing in groups (only for bot mentions)
    if (text.startsWith(`@${secrets.TELEGRAM_BOT_USERNAME}`)) {
      (async () => {
        try {
          const textWithoutBotUsername = text.replace(
            `@${secrets.TELEGRAM_BOT_USERNAME}`,
            ""
          );
          await textManager.routeText(ctx, textWithoutBotUsername);
        } catch (error) {
          logger.error("Error in textManager.routeText:", error);
        }
      })();
    }
  }
});

// Handle photo messages
bot.on(message("photo"), async (ctx) => {
  if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
    logger.debug(`Photo received in group chat`);

    // Handle scene routing in groups for photos
    (async () => {
      try {
        await sceneManager.routeText(ctx, ""); // Pass empty string for photo handling
      } catch (error) {
        logger.error("Error in sceneManager.routeText for photo:", error);
      }
    })();
  }
});

// Error handling
bot.catch((err, ctx) => {
  try {
    logger.error("Bot error:", err);
    ctx.reply(GENERIC_ERRORS.OLD_VERSION);
  } catch (error) {
    logger.error("Error in bot.catch:");
  }
});

// Export bot for external use
export { bot, sceneManager };

// Start bot if this file is run directly
if (require.main === module) {
  logger.info("🤖 Starting VIVI Telegram Bot with MEMORY session...");

  const webhookUrl = `${webhookServer.WEBHOOK_SERVER_URL}/webhook/${secrets.TELEGRAM_BOT_TOKEN}`;

  bot
    .launch({
      webhook: {
        domain: webhookUrl,
        port: Number(process.env.PORT || 8080),
      },
    })
    .then(async () => {
      await registerCommands(bot);
      logger.info("✅ Bot started successfully!");
      logger.info("💾 Sessions are stored in MEMORY (Redis disabled)");
      logger.info("⚠️  Session data will be lost on restart");
    })
    .catch((error) => {
      logger.error("❌ Failed to start bot:", error);
      // Redis error handling disabled - using memory storage
      process.exit(1);
    });

  // Graceful shutdown - handle Ctrl+C properly
  const gracefulShutdown = (signal: string) => {
    logger.info(`🛑 Stopping bot... (${signal})`);

    try {
      bot.stop(signal);
      logger.info("✅ Bot stopped");
    } catch (error) {
      logger.error("❌ Error stopping bot:", error);
    }

    // Force exit after a short delay to ensure cleanup
    setTimeout(() => {
      logger.info("✅ Graceful shutdown completed");
      process.exit(0);
    }, 1000);
  };

  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

  // Backup force exit in case the above doesn't work
  process.on("SIGINT", () => {
    logger.info("⚠️  Force exit");
    process.exit(0);
  });
}
