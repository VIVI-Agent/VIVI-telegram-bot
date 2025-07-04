// src/server/routes/userRoutes.ts
import express from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { getUserInfo } from "../controllers/user/getUserInfo";

const router = express.Router();

router.get("/info", verifyJWT, getUserInfo);

export default router;
