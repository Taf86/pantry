import type { Logger } from "pino";
import type { Auth } from "./auth.js";
import type { Database } from "./db/client.js";
import type { AppConfig } from "./config/env.js";
import type { AdminNotifier } from "./services/notifications/admin-notifier.js";
import type { AppLimits } from "./server/rate-limit.js";
import type { EventBus } from "./realtime/events.js";

export interface AppServices {
  config: AppConfig;
  db: Database;
  auth: Auth;
  logger: Logger;
  limits: AppLimits;
  notifier: AdminNotifier;
  events: EventBus;
}
