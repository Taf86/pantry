ALTER TABLE "users" DROP CONSTRAINT "users_status_check";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'unactivated';--> statement-breakpoint
-- Aggiunto a mano: drizzle-kit genera solo il DROP/ADD del vincolo, non la
-- riscrittura dei dati. Deve stare fra i due, perché il vecchio CHECK
-- rifiuterebbe il nuovo valore e il nuovo rifiuterebbe quello vecchio.
UPDATE "users" SET "status" = 'unactivated' WHERE "status" = 'invited';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('unactivated','active','suspended'));