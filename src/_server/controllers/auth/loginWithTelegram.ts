// src/server/controllers/auth/loginWithTelegram.ts

import { Request, Response } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { apiLogger, logger } from "../../../logger/logger";

import { api } from "../../../config";

export const loginWithTelegram = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { authToken, appType } = req.query;

  if (!authToken) {
    res.status(400).json({ error: "Missing authToken parameter." });
    return;
  }

  try {
    const decoded = jwt.verify(
      authToken as string,
      api.JWT_SECRET
    ) as jwt.JwtPayload;

    const { tgUserId, tgUsername } = decoded;

    if (appType === "admin") {
      const ADMIN_USER_IDS =
        process.env.NODE_ENV !== "production" ? [1, 2, 3] : [1, 2, 7]; // IDs de administradores
      const user = await req.services.userService.getUserByTgId(
        tgUserId.toString()
      );
      if (user && !ADMIN_USER_IDS.includes(user.id)) {
        res.status(403).json({ error: "Not authorized as admin" });
        return;
      }
    }
    if (!tgUserId || !tgUsername) {
      res.status(400).json({ error: "Incomplete user data in authToken." });
      return;
    }

    const token = jwt.sign({ tgUserId, tgUsername }, api.JWT_SECRET, {
      expiresIn: api.JWT_EXPIRATION,
    } as SignOptions);

    res.json({ token });
  } catch (error) {
    apiLogger.error("Error verifying authToken:", error);
    res.status(401).json({ error: "Invalid or expired authToken." });
  }
};
