// src/messages/mainMenu.ts

import { Prisma } from "@prisma/client";
import { formatEthBalance } from "@utils";

export const BALANCE_REFRESHED = "ETH and Tokens balances refreshed!";
export const REFRESHING_BALANCE = "Refreshing Balance";
export const BALANCE_REFRESH_FAILED =
  "Failed to refresh balance. Please try again.";

export const MAIN_MENU_BUTTONS = {
  ADD_TO_GROUP: "👥 Add me to Group",
  SETTINGS: "⚙️ Settings",
  BUY: "🛒 Buy",
  SELL: "💸 Sell",
  WALLETS: "💼 Wallets",
  REFRESHING: "🔄 (Refreshing...)",
  REFRESH: "🔄 Refresh Balance",
  HOLDINGS: "💰 Positions",
  WITHDRAW: "📤 Withdraw",
  LOGIN: "🔗 Access Dashboard",
  REF_LINK: "🤝 Referral",
  DISMISS: "x Dismiss",
};

export function getMenuText(
  totalBalanceBigInt: bigint,
  points: Prisma.Decimal,
  referralPoints: Prisma.Decimal,
  totalVolumeBoughtWei: Prisma.Decimal,
  totalVolumeSoldWei: Prisma.Decimal,
  userRefCount: number
) {
  // Calculate total balance across all wallets
  const totalBalanceETH = formatEthBalance(totalBalanceBigInt);

  // Calculate other metrics (same as original)
  const totalVol = totalVolumeBoughtWei.add(totalVolumeSoldWei);
  const volBougth = BigInt(totalVol.toString());
  const totalVolumeETH = formatEthBalance(volBougth);
  const totalPoints = points.add(referralPoints);
  const pointsMulRef = (totalPoints.toNumber() + userRefCount * 690).toString();

  // Return the formatted text
  return `
<a href="https://github.com/VIVI-Agent/VIVI-changelog/blob/main/CHANGELOG.md"><b>👒 v.0.5.6 [Alpha]</b></a>
────────────────────────
<a href="https://vivi.win/docs">📄 Docs</a>
<a href="https://vivi.win">🌎 Website</a>
<a href="https://x.com/vividotwin">🐦 Twitter</a>
<a href="https://t.me/viviaccess">🥃 TG group</a>
────────────────────────
<b>Balance:</b> ${totalBalanceETH} ETH
<b>Traded Volume:</b> ${totalVolumeETH} ETH
<b>Total Points:</b> ${parseFloat(pointsMulRef).toFixed(2)}`;
}
