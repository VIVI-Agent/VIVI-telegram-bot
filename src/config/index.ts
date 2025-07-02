// src/config/index.ts

import dotenv from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.development" });
} else if (process.env.NODE_ENV === "staging") {
  dotenv.config({ path: ".env.staging" });
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().nonempty(),
  TELEGRAM_BOT_USERNAME: z.string().nonempty(),
  ENCRYPTION_KEY: z.string().nonempty(),
  DATABASE_URL: z.string().nonempty(),
  BASE_RPC_URL: z.string().nonempty(),
  BASE_DRPC_URL: z.string().nonempty(),
  BASE_CHAIN: z.enum(["sepolia", "mainnet"]).default("sepolia"),
  UNISWAPV2_ROUTER: z.string().nonempty(),
  FEE_SWAP_WRAPPER: z.string().nonempty(),
  FEE_SWAP_WRAPPER_AERO: z.string().nonempty(),
  FEE_SWAP_WRAPPERV3: z.string().nonempty(),
  FEE_SWAP_WRAPPER_ZORA: z.string().nonempty(),
  FEE_SWAP_WRAPPER_VIRTUAL: z.string().nonempty(),
  UNISWAP_V3_QUOTER_ADDRESS: z.string().nonempty(),
  ETH_ADDRESS: z.string().nonempty(),
  WEBHOOK_SERVER_URL: z.string().nonempty(),
  REDIS_URL: z.string().nonempty(),
  FEE_AMOUNT: z.coerce.number(),
  JWT_SECRET: z.string().nonempty(),
  JWT_EXPIRATION: z.string().nonempty(),
  FRONTEND_URL: z.string().nonempty(),
  ADMIN_URL: z.string().nonempty(),
  SERVER_PORT: z.coerce.number(),
  DD_API_KEY: z.string().nonempty(),
  DD_HOSTNAME_BOT: z.string().nonempty(),
  DD_HOSTNAME_API: z.string().nonempty(),
  DD_TAG_BOT: z.string().nonempty(),
  DD_TAG_API: z.string().nonempty(),
  DEXT_API_KEY: z.string().optional(),
  FEE_SWAP_WRAPPER_APESTORE: z.string().optional(),
  APESTORE_API_KEY: z.string().nonempty(),
  APESTORE_ROUTER_ADDRESS: z.string().nonempty(),
  ERC20_BATCH_ADDRESS: z.string().nonempty(),
  ETH_BATCH_ADDRESS: z.string().nonempty(),
  VIVI_MIXED_BATCH_TRANSFER_CONTRACT_ADDRESS: z.string().nonempty(),
  ONBOARD_ETH_AMOUNT: z.string().default("0.00007"),
  MAX_SEND_RECIPIENTS: z.coerce.number().default(30),
});

const parsedEnv = envSchema.parse(process.env);

export const api = {
  JWT_SECRET: parsedEnv.JWT_SECRET,
  JWT_EXPIRATION: parsedEnv.JWT_EXPIRATION,
  FRONTEND_URL: parsedEnv.FRONTEND_URL,
  ADMIN_URL: parsedEnv.ADMIN_URL,
  SERVER_PORT: parsedEnv.SERVER_PORT,
};

export const secrets = {
  TELEGRAM_BOT_TOKEN: parsedEnv.TELEGRAM_BOT_TOKEN,
  ENCRYPTION_KEY: parsedEnv.ENCRYPTION_KEY,
  DATABASE_URL: parsedEnv.DATABASE_URL,
  TELEGRAM_BOT_USERNAME: parsedEnv.TELEGRAM_BOT_USERNAME,
  APESTORE_API_KEY: parsedEnv.APESTORE_API_KEY,
};

export const base = {
  BASE_RPC_URL: parsedEnv.BASE_RPC_URL,
  BASE_DRPC_URL: parsedEnv.BASE_DRPC_URL,
  BASE_CHAIN: parsedEnv.BASE_CHAIN,
};

export const contracts = {
  UNISWAPV2_ROUTER: parsedEnv.UNISWAPV2_ROUTER,
  FEE_SWAP_WRAPPER: parsedEnv.FEE_SWAP_WRAPPER,
  FEE_SWAP_WRAPPER_AERO: parsedEnv.FEE_SWAP_WRAPPER_AERO,
  FEE_SWAP_WRAPPERV3: parsedEnv.FEE_SWAP_WRAPPERV3,
  FEE_SWAP_WRAPPER_ZORA: parsedEnv.FEE_SWAP_WRAPPER_ZORA,
  FEE_SWAP_WRAPPER_VIRTUAL: parsedEnv.FEE_SWAP_WRAPPER_VIRTUAL,
  UNISWAP_V3_QUOTER_ADDRESS: parsedEnv.UNISWAP_V3_QUOTER_ADDRESS,
  ETH: parsedEnv.ETH_ADDRESS,
  FEE_AMOUNT: parsedEnv.FEE_AMOUNT,
  APESTORE_ROUTER_ADDRESS: parsedEnv.APESTORE_ROUTER_ADDRESS,
  FEE_SWAP_WRAPPER_APESTORE: parsedEnv.FEE_SWAP_WRAPPER_APESTORE,
  ERC20_BATCH_ADDRESS: parsedEnv.ERC20_BATCH_ADDRESS,
  ETH_BATCH_ADDRESS: parsedEnv.ETH_BATCH_ADDRESS,
  VIVI_MIXED_BATCH_TRANSFER_CONTRACT_ADDRESS:
    parsedEnv.VIVI_MIXED_BATCH_TRANSFER_CONTRACT_ADDRESS,
  ONBOARD_ETH_AMOUNT: parsedEnv.ONBOARD_ETH_AMOUNT,
  ZORA_TOKEN_ADDRESS: "0x1111111111166b7FE7bd91427724B487980aFc69",
  USDC_TOKEN_ADDRESS: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
};

export const webhookServer = {
  WEBHOOK_SERVER_URL: parsedEnv.WEBHOOK_SERVER_URL,
};

export const redisStore = {
  REDIS_STORE_URL: parsedEnv.REDIS_URL,
};

export const chainEnv = parsedEnv.BASE_CHAIN;

export const DD = {
  apiKey: parsedEnv.DD_API_KEY,
  botHostname: parsedEnv.DD_HOSTNAME_BOT,
  apiHostname: parsedEnv.DD_HOSTNAME_API,
  botTags: parsedEnv.DD_TAG_BOT,
  apiTags: parsedEnv.DD_TAG_API,
};

export const dext = {
  DEXT_API_KEY: parsedEnv.DEXT_API_KEY,
};

export const limits = {
  MAX_SEND_RECIPIENTS: parsedEnv.MAX_SEND_RECIPIENTS,
};
