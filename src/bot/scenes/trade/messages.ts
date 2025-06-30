export const TRADE_TEXTS = {
  BUTTONS: {
    BUY_TOKEN: "💚 Buy Token",
    SELL_TOKEN: "❤️ Sell Token",
  },

  FUNCTIONS: {
    getTradeMessage: () =>
      `💹 <b>Trade Menu</b>\n\n` +
      `Choose your trading action:\n\n` +
      `💚 <b>Buy Token</b> - Purchase new tokens\n` +
      `❤️ <b>Sell Token</b> - Sell your holdings\n` +
      `📋 <b>View Orders</b> - Check your order history`,
  },
} as const;
