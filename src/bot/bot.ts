import { session, Telegraf } from "telegraf";
import { message } from "telegraf/filters";

import { redisStore, secrets, webhookServer } from "@config";
import { services } from "@domain";
import { GlobalSceneContext, GlobalSessionData } from "@types";

import { GlobalSceneManagerImpl } from "./core/GlobalSceneManager";

import { createAuthMiddleware } from "./middlewares/AuthMiddleware";
import { Redis } from "@telegraf/session/redis";
import { logger } from "@logger";
import { GENERIC_ERRORS } from "@texts";
import { registerCommands } from "./commands";
import { textManager } from "./textHandlers";

// Create bot instance
const bot = new Telegraf<GlobalSceneContext>(secrets.TELEGRAM_BOT_TOKEN || "");

// Create global scene manager
const sceneManager = new GlobalSceneManagerImpl();

const store = Redis<GlobalSessionData>({
  url: redisStore.REDIS_STORE_URL,
  config: { pingInterval: 30000 },
});

// Session middleware with Redis
bot.use(
  session({
    store,
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
  if (ctx.chat?.type === "private") {
    const callbackQuery = ctx.callbackQuery;
    if (callbackQuery && "data" in callbackQuery) {
      const callback = callbackQuery.data;
      logger.info(`Callback received: ${callback}`);
      await sceneManager.routeCallback(ctx, callback);
    }
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

// Handle text messages
bot.on(message("text"), async (ctx) => {
  // Skip All Commands
  if (ctx.message.text?.startsWith("/")) {
    return;
  }

  // Handle Text Messages In Private Chats (BOT DM)
  if (ctx.chat?.type === "private") {
    const text = ctx.message.text;

    logger.info(`Text received: ${text}`);

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
    logger.info(`Text received: ${text}`);
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

// Error handling
bot.catch((err, ctx) => {
  logger.error("Bot error:", err);
  ctx.reply(GENERIC_ERRORS.OLD_VERSION);
});

// Export bot for external use
export { bot, sceneManager };

// Start bot if this file is run directly
if (require.main === module) {
  logger.info("🤖 Starting VIVI Telegram Bot with Redis session...");

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
      logger.info("💾 Sessions are now stored in Redis");
      logger.info("📈 Memory usage optimized for production");
    })
    .catch((error) => {
      logger.error("❌ Failed to start bot:", error);
      if (
        error.message?.includes("redis") ||
        error.message?.includes("Redis")
      ) {
        logger.error(
          "🔴 Redis connection error. Please ensure Redis is running on:"
        );
      }
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
