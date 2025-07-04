import { Telegraf } from "telegraf";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Telegraf(botToken);
const prisma = new PrismaClient();

/**
 * Function to notify all users about the new PNL feature
 */
async function notifyUsersAboutPNLFeature(): Promise<void> {
  try {
    console.info("Starting user notification about PNL feature...");

    const users = await prisma.user.findMany({
      where: {
        // prod
        tgUserId: { not: null },
        // stg ron donson only
        //tgUserId: 7303905613,
      },
      select: {
        id: true,
        tgUserId: true,
        tgUsername: true,
      },
    });

    console.info(`Found ${users.length} active users to notify.`);

    // 2. Create message about new PNL feature
    const message = `<b>🆕 <a href="https://vivi.win/changelog">v0.4.9</a>:</b> PNL tracking system (MVP). Check the <a href="https://vivi.win/changelog">Changelog</a> for details.

<i>💡 Click button below to continue with the new version.</i>`;

    // 3. Tracking counters
    let successCount = 0;
    let errorCount = 0;

    // 4. Rate limiting: Telegram allows around 30 messages per second
    const MESSAGE_RATE_LIMIT = 30; // messages per second
    const delayMs = Math.floor(1000 / MESSAGE_RATE_LIMIT);

    // 5. Process each user
    for (const user of users) {
      if (!user.tgUserId) continue;
      try {
        // Send text message with button
        await bot.telegram.sendMessage(Number(user.tgUserId), message, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⚡️Start",
                  callback_data: "GO_TO_MAIN_MENU",
                },
              ],
            ],
          },
        });

        successCount++;
        console.info(
          `PNL notification sent to user ${user.tgUsername || user.id} (${
            user.tgUserId
          })`
        );
      } catch (error) {
        errorCount++;
        console.error(
          `Error notifying user ${user.tgUsername || user.id} (${
            user.tgUserId
          }): ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Wait for rate limit before processing next user
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.info(
      `Process completed. Successful notifications: ${successCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    console.error(
      `General error during process: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  } finally {
    // Close connections
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Execute the main function
notifyUsersAboutPNLFeature().catch((err) => {
  console.error("Fatal error in notifyUsersAboutPNLFeature:", err);
  process.exit(1);
});
