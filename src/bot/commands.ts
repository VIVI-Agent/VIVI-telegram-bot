import { Telegraf } from "telegraf";
import { GlobalSceneContext } from "@types";

export async function registerCommands(bot: Telegraf<GlobalSceneContext>) {
  try {
    // 1) Commands for Private Chats (default scope)
    await bot.telegram.setMyCommands(
      [
        { command: "start", description: "Main Menu" },
        { command: "trade", description: "Open Trade interface" },
        { command: "positions", description: "View portfolio & holdings" },
        { command: "wallets", description: "Manage trading wallets" },
        { command: "settings", description: "Configure trading preferences" },
        { command: "referral", description: "View referral link" },
        { command: "balance", description: "Check your public wallet balance" },
        // { command: "help", description: "Get help & documentation" },
      ],
      {
        scope: { type: "default" },
      }
    );

    // Commands available to all group members
    await bot.telegram.setMyCommands(
      [
        {
          command: "leaderboard",
          description: "View buy event leaderboard 📊",
        },
        {
          command: "myeventstat",
          description: "Your personal event statistics 📈",
        },
        {
          command: "invite",
          description: "Generate registration link 🔗",
        },
        {
          command: "balance",
          description: "Check your public wallet balance",
        },
      ],
      {
        scope: {
          type: "all_group_chats",
        },
      }
    );

    // Commands available only to group administrators
    await bot.telegram.setMyCommands(
      [
        {
          command: "createbuyevent",
          description: "Create new buy event 🛠️",
        },
        {
          command: "closebuyevent",
          description: "Close active buy event ✅",
        },
        {
          command: "leaderboard",
          description: "View buy event leaderboard 📊",
        },
        {
          command: "myeventstat",
          description: "Your personal event statistics 📈",
        },
        {
          command: "invite",
          description: "Generate registration link 🔗",
        },
        {
          command: "balance",
          description: "Check your public wallet balance",
        },
      ],
      {
        scope: {
          type: "all_chat_administrators",
        },
      }
    );

    console.log("✅ Telegram commands successfully registered for all scopes");
  } catch (err) {
    console.error("❌ Error registering Telegram commands:", err);
  }
}
