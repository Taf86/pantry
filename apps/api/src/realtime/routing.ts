import { listRoom, pantryRoom, type ServerEvent } from "pantry-shared";

/**
 * La room a cui un evento va consegnato.
 *
 * Una sola funzione esaustiva: aggiungere un tipo di evento senza decidere
 * dove finisce diventa un errore di compilazione, non un bug silenzioso in cui
 * la notifica non arriva a nessuno.
 */
export const roomOf = (event: ServerEvent): string => {
  switch (event.type) {
    case "item.upserted":
    case "item.deleted":
    case "list.updated":
    case "list.deleted":
      return listRoom(event.listId);
    case "pantry.node.upserted":
    case "pantry.node.deleted":
    case "pantry.updated":
    case "pantry.deleted":
      return pantryRoom(event.pantryId);
  }
};
