import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

/**
 * Handler for /myeventstat command
 * Shows user's personal statistics in the active buy event
 */
export class MyEventStatCommandHandler {
  readonly name = "myeventstat";
  readonly description = "Show your statistics in the active buy event";

  async canExecute(ctx: GlobalSceneContext): Promise<boolean> {
    // Only works in groups/supergroups
    const chatType = ctx.chat?.type;
    return chatType === "group" || chatType === "supergroup";
  }

  async execute(ctx: GlobalSceneContext): Promise<void> {
    const chatId = ctx.chat!.id.toString();

    try {
      // Get active event
      const activeEvent =
        await ctx.services.buyEventService.getActiveGroupEventDetails(chatId);

      if (!activeEvent) {
        await ctx.reply("No active events, kiddo\\. 📭", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      const tgUserId = ctx.from?.id;
      if (!tgUserId) {
        await ctx.reply("No user in context, kiddo\\. 📭", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      // Get user from database
      const user = await ctx.services.userService.getUserByTgId(
        tgUserId.toString()
      );
      if (!user) {
        await ctx.reply("Not in my books, kiddo\\. 📖", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      // Calculate user's statistics from purchases
      const userPurchases = activeEvent.purchases.filter(
        (p) => p.userId === user.id
      );

      if (userPurchases.length === 0) {
        await ctx.reply("Not in the ranks, kiddo\\. 📭", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      // Calculate user's total spent
      let totalSpent = BigInt(0);
      userPurchases.forEach((purchase) => {
        totalSpent += BigInt(purchase.ethSpentWei.toString());
      });

      // Calculate leaderboard to find user's position
      const userStats: Record<number, { totalEth: bigint; count: number }> = {};

      activeEvent.purchases.forEach((purchase) => {
        const userId = purchase.userId;
        if (!userStats[userId]) {
          userStats[userId] = { totalEth: BigInt(0), count: 0 };
        }
        userStats[userId].totalEth += BigInt(purchase.ethSpentWei.toString());
        userStats[userId].count += 1;
      });

      // Sort by total ETH to get positions
      const sortedUsers = Object.entries(userStats)
        .map(([userId, stats]) => ({ userId: parseInt(userId), ...stats }))
        .sort((a, b) => Number(b.totalEth - a.totalEth));

      const userPosition = sortedUsers.findIndex(
        (entry) => entry.userId === user.id
      );

      if (userPosition === -1) {
        await ctx.reply("Not in the ranks, kiddo\\. 📭", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      // Helper function to escape markdown
      const escapeMarkdown = (text: string) => {
        return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
      };

      const eventName = escapeMarkdown(activeEvent.name);
      const tokenSymbol = escapeMarkdown(activeEvent.token.symbol);
      const position = userPosition + 1;
      const totalEthSpent = escapeMarkdown(
        (Number(totalSpent) / 1e18).toFixed(6)
      );
      const totalBuys = userPurchases.length;
      const totalParticipants = sortedUsers.length;

      // Find biggest buy
      const biggestBuy = userPurchases.reduce((max, purchase) =>
        Number(purchase.ethSpentWei) > Number(max.ethSpentWei) ? purchase : max
      );
      const biggestBuyAmount = escapeMarkdown(
        (Number(biggestBuy.ethSpentWei) / 1e18).toFixed(6)
      );

      // Calculate average buy
      const averageBuy = escapeMarkdown(
        (Number(totalSpent) / 1e18 / totalBuys).toFixed(6)
      );

      let message = `*📊 Your Stats — ${eventName}*\n`;
      message += `*${tokenSymbol}*\n\n`;
      message += `*🏆 Position:* ${position}/${totalParticipants}\n`;
      message += `*💰 Total Spent:* ${totalEthSpent} ETH\n`;
      message += `*🔄 Total Buys:* ${totalBuys}\n`;
      message += `*📈 Biggest Buy:* ${biggestBuyAmount} ETH\n`;
      message += `*📊 Average Buy:* ${averageBuy} ETH`;

      // Add performance indicator
      if (position <= 3) {
        message += `\n\n🥇 *Top 3\\!* Keep it up\\!`;
      } else if (position <= 10) {
        message += `\n\n🔥 *Top 10\\!* You're doing great\\!`;
      } else if (position <= Math.ceil(totalParticipants * 0.5)) {
        message += `\n\n💪 *Top 50%\\!* Not bad\\!`;
      } else {
        message += `\n\n📈 *Room for improvement\\!* Buy more to climb\\!`;
      }

      await ctx.reply(message, {
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      logger.error(
        `[MyEventStatCommandHandler] Error executing command: ${error}`
      );
      await ctx.reply("Error fetching your stats\\. Please try again\\.", {
        parse_mode: "MarkdownV2",
      });
    }
  }
}
