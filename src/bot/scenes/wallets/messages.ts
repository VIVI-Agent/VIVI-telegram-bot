import { explorerUrl } from "@client";

export const WALLET_TEXTS = {
  ERRORS: {
    UNABLE_TO_DETERMINE_USER_OR_CHAT:
      "Unable to determine user or chat. Please start the bot using /start.",
    USER_NOT_FOUND_MSG: "User not found. Please start the bot using /start.",
    WALLET_NOT_FOUND_MSG:
      "Wallet not found. Please create a wallet first using /wallets.",
    INVALID_PRIVATE_KEY: "Invalid private key.",
    WALLET_ALREADY_EXISTS: "Wallet already exists.",
    WALLET_IMPORT_FAILED:
      "Failed to import wallet. Please check the private key and try again.",
    WALLET_LIMIT_REACHED:
      "You have reached the maximum number of wallets (5).\n\nTo create a new wallet, please remove an existing one first.\n\n💡 <i>You can export the private key before removing a wallet to keep it safe.</i>",
    // Transfer errors
    INVALID_TOKEN_ADDRESS: "Invalid token address",
    INVALID_RECIPIENT_MSG:
      "The address you entered is invalid. Please enter a valid address.",
    TOKEN_NOT_HELD_MSG: "You don't hold that token in this wallet.",
    ERROR_SENDING_TX_MSG:
      "An error occurred while sending the transaction, check your balance or try a lower amount.",
    INVALID_PERCENT_MSG: "Invalid percentage. Must be between 1 and 100.",
    INVALID_AMOUNT_MSG: "Invalid amount. Must be a positive number.",
    NO_TRANSFER_DATA_MSG: "No transfer data found. Please try again.",
  },

  PROMPTS: {
    NO_WALLETS_MSG:
      "You currently have no wallets. Tap 'Create Wallet' to add one.",
    SELECT_WALLET_BELOW: "<i>Tap a wallet to pick your preferred one.</i>",
    SELECTED_WALLET_INFO:
      "<i>Your selected wallet will be used for all group activities, including <b>public buy events, group swaps, and balance displays in community features.</b></i>",
    ENTER_PRIVATE_KEY_PROMPT:
      "🔑 <b>Import Wallet</b>\n\nPlease enter your Ethereum private key:\n\n💡 <i>Expected format: 64-character hexadecimal string (with or without 0x prefix)</i>\n\n🔒 <i>Your private key will be encrypted and stored securely. This message will be deleted after processing for security.</i>",
    // Transfer prompts
    SELECT_WALLET_FOR_TRANSFER: "Select the wallet you want to transfer from:",
    ENTER_RECIPIENT_ADDRESS:
      "Please enter the recipient wallet address.\n(You can go back or dismiss at any time.)",
    ENTER_CUSTOM_PERCENT:
      "Please enter the custom percentage (0-100).\n(You can go back or dismiss at any time.)",
    ENTER_CUSTOM_AMOUNT:
      "Please enter the exact amount to transfer.\n(You can go back or dismiss at any time.)",
  },

  MESSAGES: {
    WALLET_SCENE_TITLE: "<b>Your Wallets</b>\n",
    WALLET_SELECTED_PREFIX: "Wallet selected:",
    SAVED_PRIVATE_KEY_BUTTON: "I have securely saved my private key",
    CONFIRM_AND_DELETE_BUTTON: "Confirm and Delete",
    NO_ACTIVE_WALLET: "No wallet linked",
    LIST_WALLETS_BUTTON: "📜 List Wallets",
    CREATE_WALLET_BUTTON: "➕ Create Wallet",
    IMPORT_WALLET_BUTTON: "📥 Import Wallet",
    EXPORT_WALLET: "📤 Export Wallet",
    REMOVE_WALLET: "🗑️ Remove Wallet",
    TRANSFERS_BUTTON: "💸 Transfers",
    // Transfer messages
    EMPTY_WALLET: "This wallet has no tokens or ETH balance.",
    TRANSFER_SUCCESS_ANSWER: "Transfer successful!",
    TRANSFER_CANCELED: "Transfer canceled.",
  },

  FUNCTIONS: {
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

    buildWalletBalanceLine(
      isSelected: boolean,
      address: string,
      balanceEth: string
    ): string {
      return `
<b>${isSelected ? "✅ Wallet:" : "Wallet:"}</b> <code>${address}</code>
<b>Balance:</b> ${balanceEth} ETH
<a href="${explorerUrl}/address/${address}">🔗 Open in Basescan</a>
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
      isSelected: boolean,
      currentWalletAddress: string,
      balanceStr: string
    ): string {
      return `
<b>${isSelected ? "✅ Public Wallet" : "Public Wallet"}</b>
<a href="${explorerUrl}/address/${currentWalletAddress}">
${currentWalletAddress}</a>
<b>Balance:</b> ${balanceStr} ETH
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

export const WALLETS_TEXTS = {
  ERRORS: {
    WALLET_MENU_ERROR: "❌ Error loading wallet menu",
    PRIVATE_KEY_DELETE_ERROR: "Failed to delete private key message",
    WALLET_MESSAGE_DELETE_ERROR: "Failed to delete wallet message",
    // Transfer errors
    TRANSFER_INVALID_ADDRESS:
      "Invalid recipient address. Please enter a valid Ethereum address.",
    TRANSFER_INVALID_PERCENT:
      "Invalid percentage. Please enter a number between 1 and 100.",
    TRANSFER_PERCENT_OUT_OF_RANGE: "Percentage must be between 1 and 100.",
    TRANSFER_INVALID_AMOUNT: "Invalid amount. Please enter a valid number.",
    TRANSFER_AMOUNT_TOO_SMALL: "Amount must be greater than 0.",
  },

  PROMPTS: {
    ENTER_PRIVATE_KEY_PROMPT:
      "🔑 <b>Import Wallet</b>\n\nPlease enter your Ethereum private key:\n\n💡 <i>Expected format: 64-character hexadecimal string (with or without 0x prefix)</i>\n\n🔒 <i>Your private key will be encrypted and stored securely. This message will be deleted after processing for security.</i>",
    // Transfer prompts
    TRANSFER_ENTER_RECIPIENT:
      "Please enter the recipient wallet address.\n<i>(You can cancel at any time.)</i>",
    TRANSFER_ENTER_CUSTOM_PERCENT:
      "Please enter the custom percentage (1-100).\n<i>(You can go back or cancel at any time.)</i>",
    TRANSFER_ENTER_CUSTOM_AMOUNT:
      "Please enter the exact amount to transfer.\n<i>(You can go back or cancel at any time.)</i>",
  },

  NAVIGATION: {
    GOING_TO_MAIN_MENU: "🏠 Going to main menu...",
    CLOSING_WALLETS: "❌ Closing wallets...",
    OPENING_WALLETS: "💼 Opening wallets...",
    OPENING_TRANSFERS: "💸 Opening transfers...",
    TRANSFER_CANCELED: "❌ Transfer canceled",
    TRANSFER_CONFIRMED: "✅ Transfer confirmed",
  },

  MESSAGES: {
    WALLET_MENU_TITLE: "💼 Wallet Management",
    IMPORTING_WALLET: "Importing wallet...",
    CREATING_WALLET: "Creating wallet...",
    EXPORTING_WALLET: "Exporting wallet...",
    REMOVING_WALLET: "Removing wallet...",
    LISTING_WALLETS: "Loading wallets...",
    SELECTING_WALLET: "Selecting wallet...",
    CONFIRMING_EXPORT: "Confirming export...",
    CONFIRMING_REMOVAL: "Confirming removal...",
    CONFIRMING_PRIVATE_KEY: "Confirming private key...",
    DELETING_PRIVATE_KEY: "Deleting private key...",
  },

  FUNCTIONS: {
    // Placeholder functions - these will be moved here from WALLET_TEXTS when refactoring
  },
};
