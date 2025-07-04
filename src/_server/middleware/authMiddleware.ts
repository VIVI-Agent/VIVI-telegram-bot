// src/server/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { api } from "../../config";
import { apiLogger } from "../../logger/logger";

export interface AuthenticatedRequest extends Request {
  user?: { tgUserId: string; tgUsername: string };
}

export function verifyJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Authorization header missing" });
    return;
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ error: "Invalid authorization header format" });
    return;
  }
  const token = parts[1];
  try {
    const { tgUserId, tgUsername } = jwt.verify(
      token,
      api.JWT_SECRET
    ) as jwt.JwtPayload;
    req.user = { tgUserId, tgUsername };
    next();
  } catch (error) {
    apiLogger.error("JWT verification error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
}
