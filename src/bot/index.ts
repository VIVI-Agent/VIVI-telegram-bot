import { session, Telegraf } from "telegraf";
import { message } from "telegraf/filters";

import { redisStore, secrets } from "@config";
import { services } from "@domain";
import { GlobalSceneContext, GlobalSessionData } from "@types";

import { GlobalSceneManagerImpl } from "./core/GlobalSceneManager";

import { createAuthMiddleware } from "./middlewares/AuthMiddleware";
import { Redis } from "@telegraf/session/redis";

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
  console.log("Start command received");

  try {
    // Check if user needs initialization based on wallet status
    if (!ctx.walletCreated) {
      console.log("User has no wallet, activating InitUser scene");
      await sceneManager.activateScene(ctx, "InitUser");
    } else {
      console.log("User has wallet, activating MainMenu scene");
      await sceneManager.activateScene(ctx, "MainMenu");
    }
  } catch (error) {
    console.error("Error in start command:", error);
    await ctx.reply("❌ Error starting bot. Please try again.");
  }
});

// Handle callbacks
bot.on("callback_query", async (ctx) => {
  const callbackQuery = ctx.callbackQuery;
  if (callbackQuery && "data" in callbackQuery) {
    const callback = callbackQuery.data;
    console.log(`Callback received: ${callback}`);
    await sceneManager.routeCallback(ctx, callback);
  }
});

// Handle text messages
bot.on(message("text"), async (ctx) => {
  const text = ctx.message.text;
  console.log(`Text received: ${text}`);

  // Skip commands that are handled elsewhere
  if (text.startsWith("/start")) {
    return;
  }

  await sceneManager.routeText(ctx, text);
});

// Error handling
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  ctx.reply("❌ An error occurred. Please try again.");
});

// Export bot for external use
export { bot, sceneManager };

// Start bot if this file is run directly
if (require.main === module) {
  console.log("🤖 Starting VIVI Telegram Bot with Redis session...");

  bot
    .launch()
    .then(() => {
      console.log("✅ Bot started successfully!");
      console.log("💾 Sessions are now stored in Redis");
      console.log("📈 Memory usage optimized for production");
    })
    .catch((error) => {
      console.error("❌ Failed to start bot:", error);
      if (
        error.message?.includes("redis") ||
        error.message?.includes("Redis")
      ) {
        console.error(
          "🔴 Redis connection error. Please ensure Redis is running on:"
        );
      }
      process.exit(1);
    });

  // Graceful shutdown
  process.once("SIGINT", () => {
    console.log("🛑 Stopping bot...");
    bot.stop("SIGINT");
  });

  process.once("SIGTERM", () => {
    console.log("🛑 Stopping bot...");
    bot.stop("SIGTERM");
  });
}
