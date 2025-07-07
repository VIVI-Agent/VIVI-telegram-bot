import { logger } from "@logger";
import { GlobalSceneContext } from "@types";

export class BuyEventCallbackHandlers {
  /**
   * Handle confirm close event callback
   * Format: confirm_close_event:eventId
   */
  static async handleConfirmCloseEvent(
    ctx: GlobalSceneContext,
    eventId: string
  ): Promise<void> {
    try {
      const eventIdNum = parseInt(eventId);
      if (isNaN(eventIdNum)) {
        await ctx.answerCbQuery("Invalid event ID");
        return;
      }

      // Check admin permissions again
      const admins = await ctx.getChatAdministrators();
      const isAdmin = admins.some((admin) => admin.user.id === ctx.from?.id);
      if (!isAdmin) {
        await ctx.answerCbQuery("Admins only");
        return;
      }

      // Close the event using the service
      const { event, result } =
        await ctx.services.buyEventService.closeBuyEvent(eventIdNum);

      // Delete confirmation message
      try {
        if (ctx.callbackQuery?.message?.message_id) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
      } catch (e) {
        logger.warn("Failed to delete confirmation message:", e);
      }

      // Create summary message
      const summary = this.createEventSummary(event, result);

      await ctx.replyWithPhoto(event.bannerImageUrl, {
        caption: summary,
        parse_mode: "MarkdownV2",
      });

      await ctx.answerCbQuery("Event closed successfully!");
    } catch (error) {
      logger.error(
        `[BuyEventCallbackHandlers] Confirm close event error: ${error}`
      );
      await ctx.answerCbQuery("Error closing event");
      await ctx.reply("Error closing event. Please try again.");
    }
  }

  /**
   * Handle cancel close event callback
   * Format: cancel_close_event:eventId
   */
  static async handleCancelCloseEvent(
    ctx: GlobalSceneContext,
    eventId: string
  ): Promise<void> {
    try {
      await ctx.answerCbQuery("Event close cancelled");

      if (ctx.callbackQuery?.message?.message_id) {
        await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
      }
    } catch (error) {
      logger.warn(
        `[BuyEventCallbackHandlers] Cancel close event error: ${error}`
      );
      await ctx.answerCbQuery("Cancelled");
    }
  }

  /**
   * Create formatted summary message for closed event
   */
  private static createEventSummary(event: any, result: any): string {
    const escapeMarkdown = (text: string) => {
      return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
    };

    const eventName = escapeMarkdown(event.name);
    const tokenSymbol = escapeMarkdown(event.token.symbol);
    const snapshot = result.leaderboardSnapshot as any[];

    let summary = `*📦 Event Closed: ${eventName}* `;
    summary += `— *${tokenSymbol}*\n\n`;
    summary += `*🥇 Top 10 Buyers \\(Final\\)*\n`;

    if (snapshot && snapshot.length > 0) {
      snapshot.forEach((entry: any) => {
        const username = escapeMarkdown(entry.username);
        const ethAmount = escapeMarkdown((Number(entry.eth) / 1e18).toFixed(6));
        summary += `> ${entry.rank}\\. ${username} — ${ethAmount} ETH \\(${entry.buys} buys\\)\n`;
      });
    }

    // Add biggest buy info
    if (result.biggestBuyUserId && result.biggestBuyAmountWei) {
      const biggestBuyUser = event.purchases.find(
        (p: any) => p.userId === result.biggestBuyUserId
      )?.user;

      if (biggestBuyUser) {
        const username = escapeMarkdown(biggestBuyUser.tgUsername || "Unknown");
        const ethAmount = escapeMarkdown(
          (Number(result.biggestBuyAmountWei) / 1e18).toFixed(6)
        );
        summary += `\n🚀 *Biggest Buy*\n ${username} \\| *${ethAmount} ETH*\n`;
      }
    }

    // Add most purchases info
    if (result.mostPurchasesUserId) {
      const mostPurchasesUser = event.purchases.find(
        (p: any) => p.userId === result.mostPurchasesUserId
      )?.user;

      if (mostPurchasesUser?.tgUsername) {
        const username = escapeMarkdown(mostPurchasesUser.tgUsername);
        const count =
          snapshot.find((s: any) => s.userId === result.mostPurchasesUserId)
            ?.buys || 0;
        summary += `\n💎 *Most Buys*\n ${username} *\\(${count} Buys\\)*\n`;
      }
    }

    return summary;
  }
}
