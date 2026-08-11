import type { Logger } from "pino";

import type { Auth } from "./auth/auth.js";
import type { Database } from "./db/client.js";
import type { AppConfig } from "./env.js";
import type { EventBus } from "./realtime/events.js";

/**
 * Le dipendenze del processo, costruite una volta all'avvio e passate a mano.
 *
 * Nessun container di dependency injection: a questa scala un oggetto esplicito
 * è più leggibile e — soprattutto — rende banale costruire l'applicazione nei
 * test con un bus di eventi finto.
 */
export interface AppServices {
  config: AppConfig;
  db: Database;
  auth: Auth;
  logger: Logger;
  events: EventBus;
}
