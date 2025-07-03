import { secrets } from "@config";

export function escapeMD(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatHash(txHash: string) {
  return `${txHash.slice(0, 20)}...${txHash.slice(-16)}`;
}

export function viviJoin(tgUsername?: string) {
  if (tgUsername)
    return `<a href="https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=ref_${tgUsername}">Join VIVI 🥃</a>`;
  else
    return `<a href="https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start">Join VIVI 🥃</a>`;
}

export function manageVIVI() {
  return `<a href="https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start">Manage Funds 🥃</a>`;
}

export function viviJoinPlain(tgUsername?: string) {
  if (tgUsername)
    return `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start=ref_${tgUsername}`;
  else return `https://t.me/${secrets.TELEGRAM_BOT_USERNAME}?start`;
}
