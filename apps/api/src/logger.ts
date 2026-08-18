import { pino, type Logger, type LoggerOptions } from "pino";

import type { AppConfig } from "./config/env.js";

export const createLogger = (config: AppConfig): Logger => {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "*.password",
        "*.token",
        "*.tokenHash",
      ],
      censor: "[redacted]",
    },
  };

  if (config.isProduction) {
    return pino(options);
  }

  return pino({
    ...options,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  });
};
