import { explorerUrl } from "@client";
import { formatEthBalance, formatEthBalanceWithSymbol } from "@utils";

export const WALLET_TEXTS = {
  ERRORS: {
    WALLET_NOT_FOUND: "Wallet not found or already deleted.",
    NO_WALLETS_TO_REMOVE: "No wallets to remove.",
  },

  PROMPTS: {},

  MESSAGES: {
    LIST_WALLETS_TITLE: "<b>Wallets > 📜 List Wallets</b> \n",
    CREATE_WALLET_TITLE: "<b>Wallets > ➕ Create Wallet</b>",
    IMPORT_WALLET_TITLE: "<b>Wallets > 📥 Import Wallet</b>",
    EXPORT_WALLET_TITLE: `<b>Wallets > 📤 Export Wallet</b>

💡 Exporting a wallet will reveal your private key. Make sure you have securely saved it before proceeding.

To export your wallet, select the wallet you want to export:`,
    REMOVE_WALLET_TITLE: `<b>Wallets > 🗑️ Remove Wallet</b>\n
⚠️ WARNING: Removing a wallet will delete it from the bot. If you have not backed up the private key, you will permanently lose access to any funds in this wallet.

⚠️ To remove you public wallet select another using the <b>List Wallets Menu</b>\n
Select the wallet you want to remove:`,
    TRANSFERS_TITLE: "<b>Wallets > 💸 Transfers</b>",
    SAVED_PRIVATE_KEY_BUTTON: "I have securely saved my private key",
    // Main Menu  Buttons
    LIST_WALLETS_BUTTON: "📜 List Wallets",
    CREATE_WALLET_BUTTON: "➕ Create Wallet",
    IMPORT_WALLET_BUTTON: "📥 Import Wallet",
    EXPORT_WALLET: "📤 Export Wallet",
    REMOVE_WALLET: "🗑️ Remove Wallet",
    TRANSFERS_BUTTON: "💸 Transfers",
    // Create Wallet messages
    MAX_WALLETS_REACHED: "You have reached the maximum number of wallets.",
    // Transfer messages
    EMPTY_WALLET: "This wallet has no tokens or ETH balance.",
    TRANSFER_SUCCESS_ANSWER: "Transfer successful!",
    TRANSFER_CANCELED: "Transfer canceled.",
    // Remove Wallet messages
    REMOVE_WALLET_CONFIRMATION_TITLE:
      "Are you sure you want to remove this wallet?",
    CONFIRM_REMOVE_WALLET: "✅ I'm 101% sure, Remove it",
    CANCEL_REMOVE_WALLET: "⚠️ Cancel, I'm not sure",
  },

  FUNCTIONS: {
    getExportWalletDataMsg(address: string, privateKey: string): string {
      return `
<b>Wallets > 📤 Export Wallet</b>

<b>👛 Wallet:</b>
<code>${address}</code>

<b>🔑 PRIVATE KEY</b> 
<code>${privateKey}</code>

👒 <b>IMPORTANT</b>: 
- Save this key in a secure place
- Never share it with anyone

`;
    },
    getRemoveWalletConfirmationMsg(address: string, balance: string): string {
      return `
<b>Wallets > ⚠️ Confirm Remove Wallet</b>

Address: <code>${address}</code>
Balance: ${formatEthBalanceWithSymbol(balance)}

⚠️ <b>Warning:</b> This action cannot be undone. Make sure you have your private key saved securely.

Are you sure you want to remove this wallet?

`;
    },
    buildWalletBalanceLine(
      isSelected: boolean,
      address: string,
      balanceEth: string
    ): string {
      return `
<b>${isSelected ? "✅ Wallet:" : "Wallet:"}</b> <code>${address}</code>
<b>Balance:</b> ${balanceEth} 
<a href="${explorerUrl}/address/${address}">🔗 Open in Basescan</a>
`;
    },
    getImportedWalletSuccessMsg: (address: string) => {
      return `✅ <b>Wallet imported successfully!</b>\n\n<code>${address}</code>\n\nThe private key has been securely encrypted.`;
    },
    getNewWalletFinalMsg(address: string): string {
      return `Your new wallet address is: <code>${address}</code>\nUse /wallets or return to the menu to manage your accounts.`;
    },
    getNewWalletCreatedMsg(address: string, privateKey: string): string {
      return `
A new wallet has been created for you!
Address: <code>${address}</code>

Your private key:
<code>${privateKey}</code>

Please store your private key securely.
Once you have saved it, press the button below. This private key will then be removed from this chat.
`;
    },

    getDeletePrivateKeyConfirmText(): string {
      return `
Are you sure you have saved your private key securely?
By confirming, this private key will be permanently removed from this chat.
`;
    },

    buildMenuText(walletInfo: string): string {
      return `
${walletInfo}
💡<i>Your Public Wallet balance can be triggered by anyone and is used to execute transactions in group chats.</i>
💡<i>To change it, click 'List Wallets' and select your preferred option</i>.`;
    },

    buildActiveWalletSnippet(
      currentWalletAddress: string,
      balanceStr: string
    ): string {
      return `
<b>Wallets</b>\n
<b>✅ Public Wallet</b>
<a href="${explorerUrl}/address/${currentWalletAddress}">
${currentWalletAddress}</a>
<b>Balance:</b> ${formatEthBalance(balanceStr)} ETH
`;
    },

    // Transfer functions
    selectTransferOption(tokenName: string): string {
      return `Select how much ${tokenName} you want to transfer:`;
    },

    walletSelectedForTransferText(address: string): string {
      return `Wallet *${address}* selected.\nSelect the token you want to transfer:`;
    },

    finalTransferConfirmText(data: {
      tokenName: string;
      transferType: "PERCENT" | "AMOUNT";
      transferValue: string;
      walletAddress: string;
      recipientAddress: string;
    }): string {
      return (
        `You're about to transfer:\n` +
        `- Token: ${data.tokenName}\n` +
        `- Amount: ${
          data.transferType === "PERCENT"
            ? data.transferValue + "%"
            : data.transferValue
        }\n` +
        `- From: ${data.walletAddress}\n` +
        `- To: ${data.recipientAddress}\n\n`
      );
    },

    transferSuccessText(txHash: string): string {
      const explorerLink = `${explorerUrl}/tx/${txHash}`;
      return `✅ Transfer tx submitted successfully!\n\n<b>Tx Hash:</b> <a href="${explorerLink}">${txHash}</a>`;
    },
  },
};
