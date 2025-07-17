export const REFERRAL_TEXTS = {
  FUNCTIONS: {
    getReferralMessage: (
      referralLink: string,
      totalReferrals: number,
      totalReferralVolume: string,
      referralPoints: string,
      rewardWallet: string | null,
      balance?: string | null
    ) => {
      let rewardSection = "";
      if (rewardWallet) {
        const balanceInfo =
          balance !== null && balance !== undefined
            ? `\n💰 <b>ETH Balance:</b> ${balance} ETH`
            : `\n💰 <b>ETH Balance:</b> <i>Unable to fetch</i>`;

        rewardSection = `\n\n💰 <b>Reward Wallet:</b>\n<code>${rewardWallet}</code>${balanceInfo}`;
      } else {
        rewardSection = `\n\n💰 <b>Reward Wallet:</b>\n❌ <i>No wallet configured</i>`;
      }

      return (
        `🔗 <b>Your Referral Link</b>\n\n` +
        `Share your link and earn points on each trade your referrals make!\n\n` +
        `<code>${referralLink}</code>\n\n` +
        `📊 <b>Your Referral Stats:</b>\n` +
        `👥 <b>Total Referred:</b> ${totalReferrals}\n` +
        `💰 <b>Referral Volume:</b> ${totalReferralVolume}\n` +
        `🎯 <b>Referral Points:</b> ${referralPoints}` +
        rewardSection +
        `\n\n💡 <i>Tip: Share your link with friends to earn bonus points!</i>`
      );
    },
  },
  MESSAGES: {
    SET_REWARD_WALLET: `<b>💰 Set Reward Wallet</b>

Paste the Base public address where you want to receive your referral earnings. 

<b>Format:</b> 0x... (valid Ethereum address)

<i>⚠️ Make sure this wallet is controlled by you and is on the Base network.</i>`,

    REWARD_WALLET_UPDATED: `✅ <b>Reward Wallet Updated</b>

Your reward wallet has been configured successfully:

<code>{rewardWallet}</code>
{balanceInfo}

<i>You will now receive all your rewards at this address.</i>`,

    BALANCE_INFO: "\n💰 <b>ETH Balance:</b> {balance} ETH",
    BALANCE_UNAVAILABLE: "\n💰 <b>ETH Balance:</b> <i>Unable to fetch</i>",
  },
  BUTTONS: {
    SET_REWARD_WALLET: "💰 Set Reward Wallet",
  },
} as const;
