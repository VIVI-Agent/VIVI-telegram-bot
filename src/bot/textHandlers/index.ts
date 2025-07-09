export * from "./types";
export * from "./TextManager";
export * from "./balanceHandler";
export * from "./inviteHandler";
export * from "./sendHandler";
export * from "./burnHandler";
export * from "./onboardHandler";
export * from "./buyHandler";
export * from "./sellHandler";
export * from "./boostHandler";

import { TextManager } from "./TextManager";
import { balanceTextHandler } from "./balanceHandler";
import { inviteTextHandler } from "./inviteHandler";
import { sendTextHandler } from "./sendHandler";
import { burnTextHandler } from "./burnHandler";
import { onboardTextHandler } from "./onboardHandler";
import { buyTextHandler } from "./buyHandler";
import { sellTextHandler } from "./sellHandler";
import { boostTextHandler } from "./boostHandler";
import { TextPattern } from "./types";

// Create text manager instance
export const textManager = new TextManager();

// Define balance patterns (order matters - more specific patterns first)
const balancePatterns: TextPattern[] = [
  {
    name: "balance_with_username",
    pattern: /^balance\s+@?(?<username>\w+)$/i,
    handler: balanceTextHandler,
    description: "Show balance for a specific user",
    examples: ["balance @username", "balance username"],
  },
  {
    name: "balance_own",
    pattern: /^balance$/i,
    handler: balanceTextHandler,
    description: "Show your own balance",
    examples: ["balance"],
  },
];

// Define invite patterns
const invitePatterns: TextPattern[] = [
  {
    name: "invite",
    pattern: /^invite$/i,
    handler: inviteTextHandler,
    description: "Generate referral link for user registration",
    examples: ["invite"],
  },
];

// Define send patterns (flexible patterns to capture various formats)
const sendPatterns: TextPattern[] = [
  {
    name: "send_command",
    pattern: /^send\s+.+$/i,
    handler: sendTextHandler,
    description: "Send tokens or ETH to recipients",
    examples: [
      "send 1 BOBR @username",
      "send 0.1 ETH to alice.base.eth",
      "send 100 bife to @user1 @user2",
      "send 5 of baby sato to bob.base.eth",
    ],
  },
];

// Define burn patterns (flexible patterns to capture various formats)
const burnPatterns: TextPattern[] = [
  {
    name: "burn_command",
    pattern: /^burn\s+.+$/i,
    handler: burnTextHandler,
    description: "Burn tokens by sending them to dead address",
    examples: [
      "burn 100 BOBR",
      "burn all of USDC",
      "burn half bife",
      "burn 50 baby sato",
    ],
  },
];

// Define onboard patterns (flexible patterns to capture various formats)
const onboardPatterns: TextPattern[] = [
  {
    name: "onboard_command",
    pattern: /^onboard\s+.+$/i,
    handler: onboardTextHandler,
    description:
      "Onboard users with tokens + ETH (sends both tokens and 0.00007 ETH)",
    examples: [
      "onboard 10 BOBR @username",
      "onboard 100 bife to @user1 @user2",
      "onboard 50 baby sato @alice",
      "onboard 25 tokens to bob.base.eth",
    ],
  },
];

// Define buy patterns (flexible patterns to capture various formats)
const buyPatterns: TextPattern[] = [
  {
    name: "buy_command",
    pattern: /^buy\s+.+$/i,
    handler: buyTextHandler,
    description: "Buy tokens with ETH",
    examples: [
      "buy 0.1 BOBR",
      "buy 100 bife",
      "buy 50 baby sato",
      "buy 0.01 of USDC",
    ],
  },
];

// Define sell patterns (flexible patterns to capture various formats)
const sellPatterns: TextPattern[] = [
  {
    name: "sell_command",
    pattern: /^sell\s+.+$/i,
    handler: sellTextHandler,
    description: "Sell tokens for ETH",
    examples: [
      "sell 50 BOBR",
      "sell all bife",
      "sell half baby sato",
      "sell 25% of USDC",
    ],
  },
];

// Define boost patterns (flexible patterns to capture various formats)
const boostPatterns: TextPattern[] = [
  {
    name: "boost_command",
    pattern: /^boost\s+.+$/i,
    handler: boostTextHandler,
    description: "Boost VIVI with ETH",
    examples: ["boost vivi 0.069"],
  },
];

// Register all patterns
balancePatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

invitePatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

sendPatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

burnPatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

onboardPatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

buyPatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

sellPatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

boostPatterns.forEach((pattern) => {
  textManager.registerPattern(pattern);
});

// Export for external use
export {
  balancePatterns,
  invitePatterns,
  sendPatterns,
  burnPatterns,
  onboardPatterns,
  buyPatterns,
  sellPatterns,
  boostPatterns,
};
