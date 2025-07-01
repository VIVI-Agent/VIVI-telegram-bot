// src/bot/initServices.ts
import { PrismaClient } from "@prisma/client";
import { logger } from "@logger";

import {
  BuySettingsService,
  SellSettingsService,
  TokenService,
  UserService,
  WalletService,
  HoldingService,
  PnlCacheService,
  AllowanceService,
  FeeWhitelistService,
} from "./index";

const prisma = new PrismaClient();

const userService = new UserService(prisma, logger);
const walletService = new WalletService(prisma);
const buySettingsService = new BuySettingsService(prisma);
const sellSettingsService = new SellSettingsService(prisma);
const tokenService = new TokenService(prisma);
const holdingService = new HoldingService(prisma);
const pnlCacheService = new PnlCacheService(prisma);
const allowanceService = new AllowanceService(prisma);
const feeWhitelistService = new FeeWhitelistService(prisma);

export const services = {
  userService,
  walletService,
  buySettingsService,
  sellSettingsService,
  tokenService,
  holdingService,
  pnlCacheService,
  allowanceService,
  feeWhitelistService,
};

export interface MyServices {
  userService: UserService;
  walletService: WalletService;
  buySettingsService: BuySettingsService;
  sellSettingsService: SellSettingsService;
  tokenService: TokenService;
  holdingService: HoldingService;
  pnlCacheService: PnlCacheService;
  allowanceService: AllowanceService;
  feeWhitelistService: FeeWhitelistService;
}
