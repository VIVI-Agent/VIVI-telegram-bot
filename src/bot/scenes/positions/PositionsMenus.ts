import { GENERIC_BUTTONS } from "@texts";
import { BaseMenus, GlobalSceneContext, PositionsSceneData } from "../../types";
import { CB } from "./callbacks";
import { POSITIONS_TEXTS } from "./messages";
import { generateTradeLink } from "@utils";

export class PositionsMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "PositionsMenus");
  }

  /**
   * Helper function to format numbers with US-style separators
   */
  private formatNumberUS(value: string | number, decimals: number = 4): string {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    return numValue.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
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

  async buildPortfolioView(ctx: GlobalSceneContext, positions: any[]) {
    // Sort tokens alphabetically by symbol
    positions.sort((a, b) => a.token.symbol.localeCompare(b.token.symbol));

    let text = `${POSITIONS_TEXTS.MESSAGES.PORTFOLIO_TITLE}\n\n`;

    if (positions.length === 0) {
      text += POSITIONS_TEXTS.MESSAGES.NO_TOKENS_MESSAGE;
    } else {
      positions.forEach((item) => {
        const balance = this.formatNumberUS(item.balance, 4);
        const valueEth = item.valueEth ? `${item.valueEth} Ξ` : "-";
        const unrealized = item.unrealizedPnlEth
          ? `${item.unrealizedPnlEth} Ξ`
          : "-";
        const pct = item.pnlPct || "-";
        const realized = item.realizedPnlEth ? `${item.realizedPnlEth} Ξ` : "-";

        try {
          text += `• <b><a href="${generateTradeLink({
            tokenAddress: item.token.address,
            mode: "sell",
          })}">${item.token.symbol}</a></b>: ${balance}\n`;
        } catch {
          text += `• <b>${item.token.symbol}</b>: ${balance}\n`;
        }

        text += `  - Value: ${valueEth}\n`;
        text += `  - Unrealized: ${unrealized} (${pct})\n`;
        text += `  - Realized: ${realized}\n`;
      });
    }

    return { text };
  }
}
