// src/server/middleware/adminMiddleware.ts
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./authMiddleware";
import { apiLogger } from "../../logger/logger";

const ADMIN_USER_IDS = [2, 3, 7]; // Hardcoded admin user IDs

export async function verifyAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tgUserId } = req.user || {};

    if (!tgUserId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Use services from request context
    const user = await req.services.userService.getUserByTgId(tgUserId);

    if (!user || !ADMIN_USER_IDS.includes(user.id)) {
      apiLogger.warn(
        `Unauthorized admin access attempt by user ID: ${user?.id}`
      );
      res.status(403).json({ error: "You don't have admin privileges" });
      return;
    }

    next();
  } catch (error) {
    apiLogger.error("Admin verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
