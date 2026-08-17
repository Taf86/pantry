import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./auth.js";

/**
 * Richieste di registrazione in attesa di approvazione.
 *
 * Vivono in una tabella propria e non come quarto valore di `users.status`:
 * una richiesta non è un account a metà — non ha credenziali, non ha sessioni,
 * e se viene rifiutata non deve lasciare in `users` una riga che tiene occupata
 * l'email per sempre. L'approvazione riusa il flusso di invito esistente:
 * crea l'utente e genera il link da consegnare (§5).
 */
export const signupRequests = pgTable(
  "signup_requests",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    /**
     * Come raggiungere la persona. Senza email da spedire è l'unico canale per
     * consegnarle il link di attivazione, quindi è obbligatorio.
     */
    contact: text("contact").notNull(),
    status: text("status").notNull().default("pending"),
    /** Utente prodotto dall'approvazione: traccia di audit, non vincolo. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "signup_requests_status_check",
      sql`${table.status} IN ('pending','approved','rejected')`,
    ),
    /**
     * Una sola richiesta aperta per indirizzo, come invariante del database e
     * non come select-poi-insert: due invii simultanei non possono riuscire
     * entrambi. Essendo parziale, lascia comunque ri-candidarsi dopo un
     * rifiuto e lascia accumulare lo storico.
     */
    uniqueIndex("idx_signup_requests_open")
      .on(table.email)
      .where(sql`${table.status} = 'pending'`),
    index("idx_signup_requests_queue").on(table.status, table.createdAt),
  ],
);
