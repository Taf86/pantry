import type { ServerEvent } from "pantry-shared";

/**
 * Il canale di notifica, visto dai servizi.
 *
 * I servizi non sanno che esiste Socket.IO: pubblicano un evento e basta.
 * È ciò che permette di testarli con un bus di prova, e di cambiare
 * trasporto senza toccare la logica.
 */
export interface EventBus {
  publish(event: ServerEvent): void;
}

/** Bus inerte: usato nei test e prima che il server real-time sia pronto. */
export const nullEventBus: EventBus = { publish: () => {} };

/** Bus che registra gli eventi: comodo per asserirli nei test. */
export const createRecordingEventBus = (): EventBus & {
  events: ServerEvent[];
} => {
  const events: ServerEvent[] = [];
  return { events, publish: (event) => void events.push(event) };
};
