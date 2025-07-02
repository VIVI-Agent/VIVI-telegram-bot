// src/api/client.ts
import axios from "axios";
import { dext } from "@config";
import Bottleneck from "bottleneck";
import axiosRetry from "axios-retry";
import { logger } from "@logger";

export const API_KEY = dext.DEXT_API_KEY;

export const apiClient = axios.create({
  baseURL: "https://public-api.dextools.io/trial",
  headers: {
    "X-API-KEY": API_KEY,
  },
});

const limiter = new Bottleneck({
  minTime: 1000,
  maxConcurrent: 1,
});

apiClient.interceptors.request.use(async (config) => {
  await limiter.schedule(() => Promise.resolve());
  return config;
});

axiosRetry(apiClient, {
  retries: 3, // por ejemplo
  retryDelay: (retryCount) => {
    logger.info(`Retrying request, attempt number ${retryCount}`);
    return 2000 * retryCount; // backoff lineal
  },
  retryCondition: (error) => {
    logger.info(`Error status: ${error.response?.status}`);
    return error.response?.status === 429; // reintenta sólo si 429
  },
});
