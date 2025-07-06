import { viviJoin } from "@utils";

// Generic error messages
export const GENERIC_ERRORS = {
  USERNAME_NOT_SET: `👒 Please set a Telegram username in your profile settings and /start again.`,
  USER_NOT_FOUND: `👒 Sorry kiddo, you're not in my books - ${viviJoin()}`,
  NO_WALLETS_FOUND: `👒 Sorry kiddo, you don't have any wallets yet - ${viviJoin()}`,
  OLD_VERSION: `👒 You are using an old version of the bot! Type in or tap /start to use the new version.`,
};
