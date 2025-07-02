import { explorerUrl } from "@client";
import { WalletWithHoldings } from "@domain";
import { Token } from "@prisma/client";
import { WalletsSceneData } from "@types";
import {
  formatEthBalance,
  formatEthBalanceWithSymbol,
  formatTokenBalance,
} from "@utils";

export const WALLET_TEXTS = {
  ERRORS: {
    WALLET_NOT_FOUND: "Wallet not found or already deleted.",
    NO_WALLETS_TO_REMOVE: "No wallets to remove.",
    INVALID_PRIVATE_KEY: `<b>👛 Wallets > 📥 Import Wallet</b>

⚠️ <b>Invalid private key format.</b> Please enter a valid 64-character hexadecimal string (with or without 0x prefix).

<b>Go Back and try again.</b>`,
    CANT_IMPORT_DELETED_WALLET: `<b>👛 Wallets > 📥 Import Wallet</b>

⚠️ <b>This wallet has been deleted.</b> Please import a different wallet.

<b>Go Back and try again.</b>`,
    CANT_IMPORT_EXISTING_WALLET: `<b>👛 Wallets > 📥 Import Wallet</b>

⚠️ <b>This wallet has already been imported.</b> Please import a different wallet.

<b>Go Back and try again.</b>`,
  },

  PROMPTS: {},

  MESSAGES: {
    ASK_FOR_TOKEN_TITLE:
      "<b>👛 Wallets > 📥 Import Token</b>\n\nEnter the token address:",
    LIST_WALLETS_TITLE: "<b>👛 Wallets > 📜 List Wallets</b> \n",
    CREATE_WALLET_TITLE: "<b>👛 Wallets > ➕ Create Wallet</b>",
    IMPORT_WALLET_TITLE: "<b>👛 Wallets > 📥 Import Wallet</b>",
    EXPORT_WALLET_TITLE: `<b>👛 Wallets > 📤 Export Wallet</b>

💡 Exporting a wallet will reveal your private key. Make sure you have securely saved it before proceeding.

To export your wallet, select the wallet you want to export:`,
    REMOVE_WALLET_TITLE: `<b>Wallets > 🗑️ Remove Wallet</b>\n
⚠️ WARNING: Removing a wallet will delete it from the bot. If you have not backed up the private key, you will permanently lose access to any funds in this wallet.

⚠️ To remove you public wallet select another using the <b>List Wallets Menu</b>\n
Select the wallet you want to remove:`,
    TRANSFERS_TITLE: `<b>Wallets > 💸 Transfers</b>

Select the wallet you want to Withdraw from:`,
    SAVED_PRIVATE_KEY_BUTTON: "I have securely saved my private key",
    // Main Menu  Buttons
    LIST_WALLETS_BUTTON: "📜 List Wallets",
    CREATE_WALLET_BUTTON: "➕ Create Wallet",
    IMPORT_WALLET_BUTTON: "📥 Import Wallet",
    EXPORT_WALLET: "📤 Export Wallet",
    REMOVE_WALLET: "🗑️ Remove Wallet",
    TRANSFERS_BUTTON: "💸 Transfers",
    IMPORT_TOKEN_BUTTON: "📥 Import Token",
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
    // Import Wallet messages
    ENTER_PRIVATE_KEY_PROMPT: `
<b>👛 Wallets > 📥 Import Wallet</b>

💡 <i>Expected format: 64-character hexadecimal string (with or without 0x prefix)</i>

🔒 <i>Your private key will be encrypted and stored securely.</i>

Please enter your Ethereum private key:
`,
    // Transfers messages
    ETH: "ETH",
    TRANFER_SELECT_TOKEN: `
<b>👛 Wallets > 💸 Transfers</b>

Select the token you want to transfer:`,
    CANCEL_TRANSFER_CONFIRMATION: "⚠️ Cancel Transfer",
    CONFIRM_TRANSFER_CONFIRMATION: "✅ Confirm Transfer",
  },

  FUNCTIONS: {
    getImportTokenSuccessMessage(
      success: string,
      totalBalance: bigint,
      wallets: { address: string; balance: bigint }[],
      token: Token
    ): string {
      return `<b>👛 Wallets > 📥 Import Token</b>\n\n✅ ${success}\n\n<b>${
        token.symbol
      } Balance:</b> ${formatTokenBalance(
        totalBalance,
        token.decimals
      )}\n\n<b>Wallets:</b>\n${wallets
        .map(
          (w) =>
            `${w.address}: ${formatTokenBalance(w.balance, token.decimals)}`
        )
        .join("\n")}`;
    },
    getImportTokenFailedMessage(error: string): string {
      return `<b>👛 Wallets > 📥 Import Token</b>\n\n❌ ${error} \n\n<b>Go Back and try again.</b>`;
    },
    getErrorTransferMsg(error: Error): string {
      return `❌ ${error.message}`;
    },
    getSuccessTransferMsg(txHash: string): string {
      return `✅ Transfer tx submitted successfully!\n\n<b>Tx Hash:</b> <a href="${explorerUrl}/tx/${txHash}">${txHash}</a>`;
    },
    getTransferCustomAmountMessage(): string {
      return `
<b>👛 Wallets > 💸 Transfers</b>

Enter the amount you want to transfer:
`;
    },
    getTransferConfirmationMessage(sceneData: WalletsSceneData): string {
      const transferMode = sceneData.transferMode;
      if (!transferMode) return "Transfer mode not found";

      const isETH = transferMode.tokenId === "ETH";
      const tokenSymbol = isETH ? "ETH" : "Token"; // For tokens, we'd need to get the actual symbol
      const amount = transferMode.amount || "Not specified";
      const recipient = transferMode.recipient || "Not specified";

      return `
<b>👛 Wallets > 💸 Transfers</b>

<b>${isETH ? "ETH Transfer" : "Token Transfer"}</b>
${!isETH ? `<b>Token:</b> ${tokenSymbol}` : ""}
<b>Amount:</b> ${
        transferMode.customAmount
          ? `${transferMode.customAmount} ${isETH ? "ETH" : tokenSymbol}`
          : `${amount}%`
      }

<b>Recipient:</b> <code>${recipient}</code>
`;
    },
    getInvalidAmountMessage(amount: string): string {
      return `
<b>👛 Wallets > 💸 Transfers</b>

⚠️ <b>Invalid amount:</b> ${amount}

<b>Go Back and try again.</b>
`;
    },
    getInvalidAddressMessage(address: string): string {
      return `
<b>👛 Wallets > 💸 Transfers</b>

⚠️ <b>Invalid address:</b> ${address}

<b>Go Back and try again.</b>
`;
    },
    getTransferRecipientMessage(): string {
      return `
<b>👛 Wallets > 💸 Transfers</b>

Enter the recipient address:
`;
    },
    getETHTransferMessage(wallet: WalletWithHoldings): string {
      return `
<b>👛 Wallets > 💸 Transfers</b>

<b>Wallet:</b>
<code>${wallet.address}</code>
<b>Balance:</b> ${formatEthBalanceWithSymbol(wallet.balance)}

Select the amount of ETH you want to transfer:

`;
    },
    getTokenTransferMessage(wallet: WalletWithHoldings, token: Token): string {
      return `
<b>👛 Wallets > 💸 Transfers</b>

<b>Wallet:</b>
<code>${wallet.address}</code>
<b>Balance:</b> ${formatEthBalanceWithSymbol(wallet.balance)}

Token: ${token.symbol}
Address: ${token.address}

<b>Token Balance:</b> ${formatEthBalanceWithSymbol(
        wallet.holdings.find((h) => h.token.id === token.id)?.balance || "0"
      )}`;
    },

    getSuccessImportWalletMsg(address: string): string {
      return `✅ <b>Wallet imported successfully!</b>\n\n<code>${address}</code>\n\nThe private key has been securely encrypted.`;
    },

    getExportWalletDataMsg(address: string, privateKey: string): string {
      return `
<b>👛 Wallets > 📤 Export Wallet</b>

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
<b>👛 Wallets</b>\n
<b>✅ Public Wallet</b>
<a href="${explorerUrl}/address/${currentWalletAddress}">
${currentWalletAddress}</a>
<b>Balance:</b> ${formatEthBalance(balanceStr)} ETH
`;
    },
  },
};
