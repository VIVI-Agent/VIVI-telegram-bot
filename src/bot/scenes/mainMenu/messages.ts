// src/messages/mainMenu.ts

import { Prisma } from "@prisma/client";
import { formatEthBalanceWithSymbol, formatPoints } from "@utils";

export const MAIN_MENU_TEXTS = {
  MESSAGES: {},
  BUTTONS: {
    ADD_TO_GROUP: "👥 Add me to Group",
    LOGIN: "🔗 Access Dashboard",
    SETTINGS: "⚙️ Settings",
    SNIPE: " Snipe (Soon)",
    BUY: "🛒 Buy",
    HOLDINGS: "💰 Positions",
    REFRESH: "🔄 Balance",
    REFRESHING: "🔄 Refreshing",
    LIMIT_ORDER: "Limit Orders (Soon)",
    WALLETS: "💼 Wallets",
    REF_LINK: "🤝 Referral",
  },
  FUNCTIONS: {
    getMenuText(
      totalBalanceBigInt: bigint,
      points: Prisma.Decimal,
      referralPoints: Prisma.Decimal,
      totalVolumeBoughtWei: Prisma.Decimal,
      totalVolumeSoldWei: Prisma.Decimal,
      userRefCount: number
    ) {
      // Calculate total balance across all wallets
      const totalBalanceETH = formatEthBalanceWithSymbol(totalBalanceBigInt);

      // Calculate other metrics (same as original)
      const totalVol = totalVolumeBoughtWei.add(totalVolumeSoldWei);
      const volBougth = BigInt(totalVol.toString());
      const totalVolumeETH = formatEthBalanceWithSymbol(volBougth);
      const totalPoints = points.add(referralPoints);
      const pointsMulRef = (
        totalPoints.toNumber() +
        userRefCount * 690
      ).toString();

      // Return the formatted text
      return `
<a href="https://github.com/VIVI-Agent/VIVI-changelog/blob/main/CHANGELOG.md"><b>👒 v.1.0.0</b></a>
────────────────────────
<a href="https://vivi.win/docs">📄 Docs</a>
<a href="https://vivi.win">🌎 Website</a>
<a href="https://x.com/vividotwin">🐦 Twitter</a>
<a href="https://t.me/viviaccess">🥃 TG group</a>
────────────────────────
<b>Balance:</b> ${totalBalanceETH} 
<b>Traded Volume:</b> ${totalVolumeETH}
<b>Total Points:</b> ${formatPoints(parseFloat(pointsMulRef))}`;
    },
  },
};
