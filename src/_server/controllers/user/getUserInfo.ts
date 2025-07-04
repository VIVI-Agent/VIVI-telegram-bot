// src/server/controllers/user/getUserInfo.ts

import { Request, Response } from "express";
import { formatEther } from "viem";
import { apiLogger } from "../../../logger/logger";

export async function getUserInfo(req: Request, res: Response): Promise<void> {
  const { tgUserId } = (req as any).user || {};
  if (!tgUserId) {
    res.status(400).json({ error: "User not found in token" });
    return;
  }
  try {
    const user =
      await req.services.userService.getUserWithReferralInfoByTgUserId(
        String(tgUserId)
      );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const totalVolumen = user.totalVolumeBoughtWei.add(user.totalVolumeSoldWei);

    const totalVolumeETH = formatEther(BigInt(totalVolumen.toString()));

    res.json({
      id: user.id,
      tgUsername: user.tgUsername,
      points: user.points,
      referralPoints: user.referralPoints,
      totalVolumeETH,
      referrals: user.referrals,
      totalReferralVolume: user.totalReferralVolume,
    });
    return;
  } catch (error) {
    apiLogger.error("Error fetching user info:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
