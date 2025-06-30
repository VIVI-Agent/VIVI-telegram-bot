// src/bot/initServices.ts
import { PrismaClient } from "@prisma/client";
import { logger } from "@logger";

import {
  BuySettingsService,
  SellSettingsService,
  TokenService,
  UserService,
  WalletService,
} from "./index";

const prisma = new PrismaClient();

const userService = new UserService(prisma, logger);
const walletService = new WalletService(prisma);
const buySettingsService = new BuySettingsService(prisma);
const sellSettingsService = new SellSettingsService(prisma);
const tokenService = new TokenService(prisma);

export const services = {
  userService,
  walletService,
  buySettingsService,
  sellSettingsService,
  tokenService,
};

export interface MyServices {
  userService: UserService;
  walletService: WalletService;
  buySettingsService: BuySettingsService;
  sellSettingsService: SellSettingsService;
  tokenService: TokenService;
}
