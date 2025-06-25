// src/bot/initServices.ts
import { PrismaClient } from "@prisma/client";
import { logger } from "@logger";

import { UserService, WalletService } from "./index";

const prisma = new PrismaClient();

const userService = new UserService(prisma, logger);
const walletService = new WalletService(prisma);

export const services = {
  userService,
  walletService,
};

export interface MyServices {
  userService: UserService;
  walletService: WalletService;
}
