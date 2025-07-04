// src/server/routes/adminRoutes.ts
import express from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { verifyAdmin } from "../middleware/adminMiddleware";
import {
  getAllFeeWhitelists,
  createFeeWhitelist,
  updateFeeWhitelist,
  deleteFeeWhitelist,
} from "../controllers/admin/feeWhitelistController";
import {
  getUserRegistrationsByDay,
  getUserStats,
  getUserTimeline,
  getUserCumulativeData,
} from "_server/controllers/admin/userStatsController";

const router = express.Router();

// Apply authentication middleware to all admin routes
router.use(verifyJWT);
router.use(verifyAdmin);

// FeeWhitelist routes
router.get("/feewhitelist", getAllFeeWhitelists);
router.post("/feewhitelist", createFeeWhitelist);
router.put("/feewhitelist/:id", updateFeeWhitelist);
router.delete("/feewhitelist/:id", deleteFeeWhitelist);

router.get("/users/stats", getUserStats);
router.get("/users/registrations", getUserRegistrationsByDay);
router.get("/users/cumulative", getUserCumulativeData);
router.get("/users/timeline", getUserTimeline);

export default router;
