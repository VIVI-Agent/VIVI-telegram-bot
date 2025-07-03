import { GENERIC_BUTTONS } from "@texts";
import { BaseMenus, GlobalSceneContext, PositionsSceneData } from "../../types";
import { CB } from "./callbacks";
import { POSITIONS_TEXTS } from "./messages";
import { formatPnl, generateTradeLink } from "@utils";

export class PositionsMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "PositionsMenus");
  }

  /**
   * Show the main positions menu
   */
  async showPositionsMenu(
    ctx: GlobalSceneContext,
    sceneData: PositionsSceneData,
    messageId?: number
  ): Promise<number | undefined> {
    this.log("info", ctx, "Showing positions menu");

    try {
      const { positions } = sceneData;

      const { text } = await this.buildPortfolioView(ctx, positions!);

      const keyboard = [
        [
          {
            text: POSITIONS_TEXTS.BUTTONS.REFRESH,
            callback_data: this.createCallback(CB.REFRESH_POSITIONS),
          },
        ],
        [
          {
            text: GENERIC_BUTTONS.BACK_TO_MAIN_MENU,
            callback_data: this.createCallback(CB.MAIN_MENU),
          },
          {
            text: GENERIC_BUTTONS.DISMISS,
            callback_data: this.createCallback(CB.DISMISS_POSITIONS),
          },
        ],
      ];

      return await this.sendOrUpdateMenu(
        ctx,
        text,
        keyboard,
        "HTML",
        messageId
      );
    } catch (error) {
      this.log("error", ctx, `Error showing positions menu: ${error}`);
      await ctx.reply(POSITIONS_TEXTS.ERRORS.LOADING_FAILED);
      return undefined;
    }
  }

  async buildPortfolioView(ctx: GlobalSceneContext, pnlSummary: any[]) {
    // Sort tokens by total worth (highest first)
    pnlSummary.sort(
      (a, b) => parseFloat(b.totalPnlEth) - parseFloat(a.totalPnlEth)
    );

    let totalWorthEth = 0;
    let totalProfitLoss = 0;

    // Calculate totals
    pnlSummary.forEach((item) => {
      const worth =
        parseFloat(item.unrealizedPnlEth) + parseFloat(item.realizedPnlEth);
      totalWorthEth += worth;
      totalProfitLoss += parseFloat(item.totalPnlEth);
    });

    // Build the text
    let text = `${POSITIONS_TEXTS.MESSAGES.PORTFOLIO_TITLE}\n\n`;

    if (pnlSummary.length === 0) {
      text += POSITIONS_TEXTS.MESSAGES.NO_TOKENS_MESSAGE;
    } else {
      // Add portfolio summary
      text += `${POSITIONS_TEXTS.MESSAGES.TOTAL_VALUE} ${totalWorthEth.toFixed(
        4
      )} ETH\n`;
      text += `${POSITIONS_TEXTS.MESSAGES.TOTAL_PNL} ${formatPnl(
        totalProfitLoss.toFixed(4)
      )} ETH\n\n`;

      // Add token list with PNL

      pnlSummary.forEach((item) => {
        const pctChange = item.percentageReturn.replace("%", "");
        const pctFormatted = formatPnl(pctChange);

        // Determine emoji based on profit/loss
        let emoji = "⚖️";
        if (parseFloat(pctChange) > 20) emoji = "🔥";
        else if (parseFloat(pctChange) > 0) emoji = "📈";
        else if (parseFloat(pctChange) < -20) emoji = "💩";
        else if (parseFloat(pctChange) < 0) emoji = "📉";

        // Create buy and sell links for the token
        try {
          const buyLink = generateTradeLink({
            tokenAddress: item.token.address,
            mode: "buy",
          });
          const sellLink = generateTradeLink({
            tokenAddress: item.token.address,
            mode: "sell",
          });

          text += `${emoji} <b>${
            item.token.symbol
          }</b> <a href="${buyLink}">[Buy]</a> <a href="${sellLink}">[Sell]</a>: ${parseFloat(
            item.balance
          ).toFixed(4)}\n`;
        } catch (error) {
          // Fallback to non-clickeable if link generation fails
          this.log(
            "warn",
            ctx,
            `Failed to generate trade links for ${item.token.symbol}: ${error}`
          );
          text += `${emoji} <b>${item.token.symbol}</b>: ${parseFloat(
            item.balance
          ).toFixed(4)}\n`;
        }
        text += `   ${POSITIONS_TEXTS.MESSAGES.TOTAL_VALUE} ${(
          parseFloat(item.unrealizedPnlEth) + parseFloat(item.realizedPnlEth)
        ).toFixed(6)} ETH\n`;
        text += `   ${POSITIONS_TEXTS.MESSAGES.TOTAL_PNL} ${formatPnl(
          item.totalPnlEth
        )} ETH (${pctFormatted}%)\n\n`;
      });
    }

    return { text };
  }
}
