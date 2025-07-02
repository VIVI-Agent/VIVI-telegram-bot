# Text Manager System

## Overview

The Text Manager system provides natural language command processing for the Telegram bot, allowing users to interact with the bot using simple text commands instead of traditional `/commands`.

## How it Works

1. User sends text message (e.g., "balance")
2. `textManager.routeText()` checks all registered patterns
3. If a pattern matches, the corresponding handler executes
4. If no pattern matches, the text is passed to `sceneManager`

## Current Patterns

### Balance Commands

- `balance` - Shows your own ETH and token balance
- `balance @username` - Shows another user's balance

### Invite Commands

- `invite` - Generates a referral link for user registration

### Send Commands

- `send 1 BOBR @username` - Send tokens to a Telegram user
- `send 0.1 ETH to alice.base.eth` - Send ETH to a BNS name
- `send 100 bife @user1 @user2` - Send tokens to multiple recipients
- `send 5 of baby sato to bob.base.eth` - Send multi-word tokens with connector words

**Features:**

- ✅ Real-time status updates with message editing
- ✅ Messages reply to user's original command
- ✅ Consistent message format across all states
- ✅ Shows recipient names (comma-separated) instead of count
- ✅ Automatic token resolution from holdings
- ✅ Balance validation before transfer
- ✅ Multi-recipient batch transfers
- ✅ Transaction confirmation tracking
- ✅ BaseScan links for verification

## Adding New Patterns

### 1. Create a Handler

```typescript
// src/bot/textHandlers/myCommandHandler.ts
import { TextHandler, TextMatch } from "./types";

export const myCommandHandler: TextHandler = async (ctx, match) => {
  // Extract parameters from match.params
  const amount = match.params.amount;
  const token = match.params.token;

  // Your logic here
  await ctx.reply(`Processing ${amount} ${token}`);

  return true; // Successfully handled
};
```

### 2. Define the Pattern

```typescript
// In src/bot/textHandlers/index.ts
const myPattern: TextPattern = {
  name: "my_command",
  pattern: /^buy\s+(?<amount>\d+(?:\.\d+)?)\s+(?<token>\w+)$/i,
  handler: myCommandHandler,
  description: "Buy a specific amount of tokens",
  examples: ["buy 0.001 ETH", "buy 100 USDC"],
};

textManager.registerPattern(myPattern);
```

## Pattern Regex Examples

```typescript
// Simple word match
/^balance$/i
/^invite$/i

// Word with optional username
/^balance\s+@?(?<username>\w+)$/i

// Flexible send command (captures everything after "send")
/^send\s+.+$/i

// Buy command with amount and token
/^buy\s+(?<amount>\d+(?:\.\d+)?)\s+(?<token>\w+)$/i

// More specific send patterns (if needed)
/^send\s+(?<amount>\d+(?:\.\d+)?)\s+(?<token>\w+)\s+@?(?<username>\w+)$/i
```

## Parameter Extraction

The TextManager automatically extracts:

- `fullMatch` - The entire matched string
- `group1`, `group2`, etc. - Numbered capture groups
- Named groups (using `(?<name>pattern)` syntax)

## Best Practices

1. **Order Matters**: Register more specific patterns before general ones
2. **Error Handling**: Always wrap your handler logic in try-catch
3. **Return Boolean**: Return `true` if handled, `false` to continue to next pattern
4. **Case Insensitive**: Use the `i` flag for user-friendly matching
5. **Validation**: Validate parameters before processing

## Future Commands to Implement

- `buy 0.001 BOBR` - Execute buy transaction
- `sell 50% BOBR` - Execute sell transaction
- `price BOBR` - Get token price
- `chart BOBR` - Get token chart/info

## Send Command Features

The send command includes several advanced features:

### Token Aliases

- **Single word aliases**: `bife`, `usdc`, `eth` resolve to specific contract addresses
- **Multi-word aliases**: `baby sato`, `pepe coin` are treated as single tokens

### Connector Words

These words are automatically ignored during parsing: `of`, `from`, `to`, `for`, `->`, `→`, `at`, `into`, `and`

### Recipient Types

- **Telegram usernames**: `@username` or `username`
- **BNS names**: `alice.base.eth` (resolved on-chain)
- **Direct addresses**: `0x123...abc`

### Flexible Syntax Examples

- `send 1 BOBR @user`
- `send 1 of BOBR to @user`
- `send 100 bife to @user1 @user2 bob.base.eth`
- `send 5 baby sato @username`

### Message States Format

The send command shows consistent messaging across all states:

**1. Initial State:**

```
⏳ Submitting Transfer!
💰 Amount: 0.1 BARIO
👥 Recipients: @user1, alice.base.eth
```

**2. Transaction Submitted:**

```
📤 Transaction Submitted!
💰 Amount: 0.1 BARIO
👥 Recipients: @user1, alice.base.eth
🌐 View on BaseScan
```

**3. Transfer Completed:**

```
✅ Transfer Successful!
💰 Amount: 0.1 BARIO
👥 Recipients: @user1, alice.base.eth
🌐 View on BaseScan
```
