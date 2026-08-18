import type { Logger } from "pino";
import type { Auth } from "./auth.js";
import type { Database } from "./db/client.js";
import type { AppConfig } from "./config/env.js";
// import type { EventBus } from "./realtime/events.js";

export interface AppServices {
  config: AppConfig;
  db: Database;
  auth: Auth;
  logger: Logger;
  // events: EventBus;
}
