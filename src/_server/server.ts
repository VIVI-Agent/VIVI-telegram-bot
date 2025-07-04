import express, { Request, Response, NextFunction } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { api } from "../config";
import { services, prisma } from "@domain";
import { apiLogger } from "../logger/logger";

// Import routes
import authRoutes from "./routes/auth/authRoutes";
import userRoutes from "./routes/userRoutes";
import adminRoutes from "./routes/adminRoutes";

const app = express();

if (process.env.NODE_ENV !== "production") {
  apiLogger.info("set trust proxy");
  app.set("trust proxy", 1);
}

app.use(helmet());
app.disable("x-powered-by");

app.use(morgan("combined"));

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

app.use(
  cors({
    origin: [api.FRONTEND_URL, api.ADMIN_URL],
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  })
);

// Middleware to inject services into request context
app.use((req: Request, res: Response, next: NextFunction) => {
  (req as any).services = services;
  (req as any).prisma = prisma;
  next();
});

app.use("/auth", authRoutes);

app.use("/user", userRoutes);

app.use("/admin", adminRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Express server running correctly.");
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  apiLogger.error("Error:", err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal server error",
    },
  });
});

const server = http.createServer(app);

server.listen(api.SERVER_PORT, () => {
  apiLogger.info(`Express server running on port ${api.SERVER_PORT}`);
});
