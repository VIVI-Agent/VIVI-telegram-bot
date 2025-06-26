import { session, Telegraf } from "telegraf";
import { message } from "telegraf/filters";

import { redisStore, secrets } from "@config";
import { services } from "@domain";
import { GlobalSceneContext, GlobalSessionData } from "@types";

import { GlobalSceneManagerImpl } from "./core/GlobalSceneManager";

import { createAuthMiddleware } from "./middlewares/AuthMiddleware";
import { Redis } from "@telegraf/session/redis";
import { logger } from "@logger";

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
  logger.info("Start command received");

  try {
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

// Handle text messages
bot.on(message("text"), async (ctx) => {
  const text = ctx.message.text;
  logger.info(`Text received: ${text}`);

  // Skip commands that are handled elsewhere
  if (text.startsWith("/start")) {
    return;
  }

  await sceneManager.routeText(ctx, text);
});

// Error handling
bot.catch((err, ctx) => {
  logger.error("Bot error:", err);
  ctx.reply("❌ An error occurred. Please try again.");
});

// Export bot for external use
export { bot, sceneManager };

// Start bot if this file is run directly
if (require.main === module) {
  logger.info("🤖 Starting VIVI Telegram Bot with Redis session...");

  bot
    .launch()
    .then(() => {
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
