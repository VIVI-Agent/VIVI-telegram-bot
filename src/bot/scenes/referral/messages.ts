export const REFERRAL_TEXTS = {
  FUNCTIONS: {
    getReferralMessage: (
      referralLink: string,
      totalReferrals: number,
      totalReferralVolume: string,
      referralPoints: string
    ) =>
      `🔗 <b>Your Referral Link</b>\n\n` +
      `Share your link and earn points on each trade your referrals make!\n\n` +
      `<code>${referralLink}</code>\n\n` +
      `📊 <b>Your Referral Stats:</b>\n` +
      `👥 <b>Total Referred:</b> ${totalReferrals}\n` +
      `💰 <b>Referral Volume:</b> ${totalReferralVolume}\n` +
      `🎯 <b>Referral Points:</b> ${referralPoints}\n\n` +
      `💡 <i>Tip: Share your link with friends to earn bonus points!</i>`,
  },
} as const;
