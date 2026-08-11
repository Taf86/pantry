import { pino, type Logger, type LoggerOptions } from "pino";

import type { AppConfig } from "./env.js";

/**
 * Log strutturati: in produzione JSON su stdout, che Docker ruota
 * (`max-size: 10m`, `max-file: 3`). In sviluppo passa da pino-pretty.
 */
export const createLogger = (config: AppConfig): Logger => {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    /** Nessun segreto nei log, nemmeno per sbaglio. */
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
