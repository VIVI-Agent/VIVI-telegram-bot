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
  AllowanceService,
  Permit2AllowanceService,
  FeeWhitelistService,
  ExternalTokenInfoService,
  BankrCacheService,
  BuyEventService,
  TradeService,
  TradeInstructionService,
} from "./index";

const prisma = new PrismaClient();

const userService = new UserService(prisma, logger);
const walletService = new WalletService(prisma);
const buySettingsService = new BuySettingsService(prisma);
const sellSettingsService = new SellSettingsService(prisma);
const tokenService = new TokenService(prisma);
const holdingService = new HoldingService(prisma);
const allowanceService = new AllowanceService(prisma);
const permit2AllowanceService = new Permit2AllowanceService(prisma);
const feeWhitelistService = new FeeWhitelistService(prisma);
const externalTokenInfoService = new ExternalTokenInfoService(prisma, logger);
const bankrCacheService = new BankrCacheService(prisma);
const buyEventService = new BuyEventService(prisma);
const tradeService = new TradeService(prisma);
const tradeInstructionService = new TradeInstructionService(prisma);

export const services = {
  userService,
  walletService,
  buySettingsService,
  sellSettingsService,
  tokenService,
  holdingService,
  allowanceService,
  permit2AllowanceService,
  feeWhitelistService,
  externalTokenInfoService,
  bankrCacheService,
  buyEventService,
  tradeService,
  tradeInstructionService,
};

export { prisma };

export interface MyServices {
  userService: UserService;
  walletService: WalletService;
  buySettingsService: BuySettingsService;
  sellSettingsService: SellSettingsService;
  tokenService: TokenService;
  holdingService: HoldingService;
  allowanceService: AllowanceService;
  permit2AllowanceService: Permit2AllowanceService;
  feeWhitelistService: FeeWhitelistService;
  externalTokenInfoService: ExternalTokenInfoService;
  bankrCacheService: BankrCacheService;
  buyEventService: BuyEventService;
  tradeService: TradeService;
  tradeInstructionService: TradeInstructionService;
}
