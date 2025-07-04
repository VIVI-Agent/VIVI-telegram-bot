// src/server/routes/authRoutes.ts

import express from "express";
import { loginWithTelegram } from "../../controllers/auth/loginWithTelegram";

const router = express.Router();

router.get("/login", loginWithTelegram);

export default router;
