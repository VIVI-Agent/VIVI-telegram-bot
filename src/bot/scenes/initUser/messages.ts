// src/bot/scenes/InitUser/messages.ts

export const INITUSER_TEXTS = {
  MESSAGES: {
    WELCOME: `🎉 Hey Kiddo, Welcome aboard.\nGlad to have you around this early.`,
    CONFIRM_AND_DELETE_PK: "Confirm and delete private key",
  },

  FUNCTIONS: {
    getPrivateKeyMessage(walletAddress: string, privateKey: string): string {
      return (
        `You have successfully logged in! 🎉\n` +
        `Your new (and first) wallet address is: <code>${walletAddress}</code>\n\n` +
        `Your private key is:\n` +
        `<code>${privateKey}</code>\n\n` +
        `Please <b>store this private key securely</b>.\n` +
        `Once you've safely saved it, press the button below to confirm.`
      );
    },

    getNewWalletKeyMessage(walletAddress: `0x${string}`): string {
      return `Your new wallet address is: <code>${walletAddress}</code>`;
    },
  },
};
