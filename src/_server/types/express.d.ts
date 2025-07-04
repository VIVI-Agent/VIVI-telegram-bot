import { Request } from "express";
import { MyServices } from "@domain";
import { PrismaClient } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      services: MyServices;
      prisma: PrismaClient;
    }
  }
}
