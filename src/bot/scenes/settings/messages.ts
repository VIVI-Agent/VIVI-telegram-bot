export const SETTINGS_TEXTS = {
  ERRORS: {
    SETTINGS_NOT_FOUND: "Settings not found. Please start with /start.",
    BUY_SETTINGS_NOT_FOUND: "Buy settings not found. Please start with /start.",
    SELL_SETTINGS_NOT_FOUND:
      "Sell settings not found. Please start with /start.",
    BUY_AMOUNT_RANGE: "Buy amount must be greater than 0.",
    BUY_SLIPPAGE_RANGE: "Buy slippage must be between 1% and 50%.",
    SELL_AMOUNT_RANGE: "Sell percentage must be between 1% and 100%.",
    SELL_SLIPPAGE_RANGE: "Sell slippage must be between 1% and 50%.",
  },

  PROMPTS: {
    ENTER_BUY_AMOUNT: "BUY amount in ETH (e.g., 0.01 - 1)",
    ENTER_SELL_PERCENT: "SELL percentage (e.g., 12 - 50 - 100)",
    ENTER_BUY_SLIPPAGE: "BUY slippage percentage (min 1%, max 50%)",
    ENTER_SELL_SLIPPAGE: "SELL slippage percentage (min 1%, max 50%)",
  },

  MESSAGES: {
    EDIT_BUY_SETTINGS: "✏️ Buy Buttons",
    EDIT_SELL_SETTINGS: "✏️ Sell Buttons",
    EDIT_SPEED_SETTINGS: "✏️ Gas Settings",
    SETTINGS_ROOT:
      "<b>⚙️ Settings</b> \n\nSelect an option below to configure:",
    BUY_SETTINGS_MSG_TEXT: `*⚙️ Settings > Buy Buttons:* \n\nTap below to set your buy buttons values.`,
    SELL_SETTINGS_MSG_TEXT: `*⚙️ Settings > Sell Buttons:* \n\nTap below to set your sell buttons values.`,
    SLIPPAGE_SETTINGS_MSG_TEXT: `*⚙️ Settings > Gas Settings:* \n\nTap below to set your gas settings.`,
  },

  FUNCTIONS: {
    speedMenuBtn(symbol: string, speedKey: string, currentSpeed: string) {
      const isSelected = currentSpeed === speedKey ? "✅" : "";
      return `${symbol} ${speedKey} ${isSelected}`;
    },
  },
};
