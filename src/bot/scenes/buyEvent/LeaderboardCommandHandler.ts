import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

/**
 * Handler for /leaderboard command
 * Shows buy event leaderboard for active or last closed event
 */
export class LeaderboardCommandHandler {
  readonly name = "leaderboard";
  readonly description = "Show buy event leaderboard";

  async canExecute(ctx: GlobalSceneContext): Promise<boolean> {
    // Only works in groups/supergroups
    const chatType = ctx.chat?.type;
    return chatType === "group" || chatType === "supergroup";
  }

  async execute(ctx: GlobalSceneContext): Promise<void> {
    const chatId = ctx.chat!.id.toString();

    try {
      // Helper function to escape markdown
      const escapeMarkdown = (text: string) => {
        return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
      };

      // Get active event first
      const activeEvent =
        await ctx.services.buyEventService.getActiveGroupEventDetails(chatId);

      if (!activeEvent) {
        // Check if user is admin
        let isAdmin = false;
        try {
          const admins = await ctx.getChatAdministrators();
          isAdmin = admins.some((admin) => admin.user.id === ctx.from?.id);
        } catch (error) {
          logger.error(
            `[LeaderboardCommandHandler] Error checking admin status: ${error}`
          );
        }

        if (!isAdmin) {
          await ctx.reply("No active events, kiddo\\. 📭", {
            parse_mode: "MarkdownV2",
          });
          return;
        }

        // For now, just show no events message for non-admins
        await ctx.reply("No past events found\\. 📭", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      // Show active event leaderboard
      await this.showActiveEventLeaderboard(ctx, activeEvent, escapeMarkdown);
    } catch (error) {
      logger.error(
        `[LeaderboardCommandHandler] Error executing command: ${error}`
      );
      await ctx.reply("Error fetching leaderboard. Please try again.");
    }
  }

  private async showActiveEventLeaderboard(
    ctx: GlobalSceneContext,
    activeEvent: any,
    escapeMarkdown: (text: string) => string
  ): Promise<void> {
    // Calculate leaderboard from purchases data
    const userStats: Record<
      number,
      {
        username: string;
        totalEth: bigint;
        transactionCount: number;
      }
    > = {};

    // Process purchases to build leaderboard
    activeEvent.purchases.forEach((purchase: any) => {
      const userId = purchase.userId;
      if (!userStats[userId]) {
        userStats[userId] = {
          username: purchase.user.tgUsername || "Anonymous",
          totalEth: BigInt(0),
          transactionCount: 0,
        };
      }
      userStats[userId].totalEth += BigInt(purchase.ethSpentWei.toString());
      userStats[userId].transactionCount += 1;
    });

    // Sort by total ETH and take top 10
    const leaderboard = Object.entries(userStats)
      .map(([userId, stats]) => ({
        userId: parseInt(userId),
        tgUsername: stats.username,
        totalEth: stats.totalEth.toString(),
        transactionCount: stats.transactionCount,
      }))
      .sort((a, b) => Number(BigInt(b.totalEth) - BigInt(a.totalEth)))
      .slice(0, 10);

    // Get biggest buy info
    let biggestBuyInfo = "_No buys yet_";
    if (activeEvent.purchases.length > 0) {
      const biggestBuy = activeEvent.purchases.reduce((max: any, p: any) =>
        Number(p.ethSpentWei) > Number(max.ethSpentWei) ? p : max
      );

      const username = biggestBuy.user.tgUsername
        ? escapeMarkdown(biggestBuy.user.tgUsername)
        : escapeMarkdown(biggestBuy.userId.toString());

      const ethAmount = escapeMarkdown(
        (Number(biggestBuy.ethSpentWei) / 1e18).toFixed(6)
      );

      biggestBuyInfo = `*${username}* \\| *${ethAmount} ETH*`;
    }

    // Get most buys info
    let mostPurchaseInfo = "_No buys yet_";
    if (activeEvent.purchases.length > 0) {
      const buysCountByUser: Record<number, number> = {};
      activeEvent.purchases.forEach((p: any) => {
        buysCountByUser[p.userId] = (buysCountByUser[p.userId] || 0) + 1;
      });

      const mostPurchasesUserId = Number(
        Object.keys(buysCountByUser).reduce((a, b) =>
          buysCountByUser[parseInt(a)] > buysCountByUser[parseInt(b)] ? a : b
        )
      );

      const mostPurchaseUser = await ctx.services.userService.getUserById(
        mostPurchasesUserId
      );
      const mostPurchasesCount = buysCountByUser[mostPurchasesUserId];

      if (mostPurchaseUser?.tgUsername) {
        const username = escapeMarkdown(mostPurchaseUser.tgUsername);
        mostPurchaseInfo = `*${username}* *\\(${mostPurchasesCount} Buys\\)*`;
      }
    }

    // Build final message
    const eventName = escapeMarkdown(activeEvent.name);
    const tokenSymbol = escapeMarkdown(activeEvent.token.symbol);

    let message = `*🏆 ${eventName} 🏆* `;
    message += `*${tokenSymbol}*\n\n`;

    message += `*🥇 Top 10 Buyers*\n`;

    if (leaderboard && leaderboard.length > 0) {
      leaderboard.forEach((entry: any, index: number) => {
        const username = escapeMarkdown(entry.tgUsername || "Anonymous");
        const ethAmount = escapeMarkdown(
          (Number(entry.totalEth) / 1e18).toFixed(6)
        );
        const buyCount = Number(entry.transactionCount);
        message += `> ${
          index + 1
        }\\. ${username} — ${ethAmount} ETH \\(${buyCount} buys\\)\n`;
      });
    } else {
      message += "_No buyers yet\\._\n";
    }

    message += `\n*🚀 Biggest Buy*\n${biggestBuyInfo}\n`;
    message += `\n*💎 Most Buys*\n${mostPurchaseInfo}`;

    await ctx.replyWithPhoto(activeEvent.bannerImageUrl, {
      caption: message,
      parse_mode: "MarkdownV2",
    });
  }
}
