export * from "./types";
export * from "./TextManager";
export * from "./balanceHandler";
export * from "./inviteHandler";
export * from "./sendHandler";
export * from "./burnHandler";

import { TextManager } from "./TextManager";
import { balanceTextHandler } from "./balanceHandler";
import { inviteTextHandler } from "./inviteHandler";
import { sendTextHandler } from "./sendHandler";
import { burnTextHandler } from "./burnHandler";
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

// Export for external use
export { balancePatterns, invitePatterns, sendPatterns, burnPatterns };
