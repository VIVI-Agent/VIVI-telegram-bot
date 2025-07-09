import winston from "winston";
import DatadogWinston from "datadog-winston";
import { DD } from "@config";

export const logger = winston.createLogger({
  level: "info",
  transports: [
    process.env.NODE_ENV === "production"
      ? new DatadogWinston({
          apiKey: DD.apiKey,
          ddsource: "nodejs",
          service: "VIVI-tg-bot",
          hostname: DD.botHostname,
          ddtags: DD.botTags,
        })
      : new winston.transports.Console({
          format: winston.format.simple(),
        }),
  ],
});

export const apiLogger = winston.createLogger({
  level: "debug",
  transports: [
    process.env.NODE_ENV === "production"
      ? new DatadogWinston({
          apiKey: DD.apiKey,
          ddsource: "nodejs",
          service: "VIVI-api",
          hostname: DD.apiHostname,
          ddtags: DD.apiTags,
        })
      : new winston.transports.Console({
          format: winston.format.simple(),
        }),
  ],
});
