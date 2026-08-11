# 002 — PostgreSQL invece di SQLite/D1

**Stato**: accettata · **Data**: agosto 2026

## Contesto

Il volume di dati è minuscolo: una manciata di utenti, qualche centinaio di
righe. SQLite basterebbe abbondantemente per la capacità.

## Decisione

PostgreSQL 17 in container, con volume dedicato.

## Motivo

La capacità non è il criterio. Le funzionalità interessanti dell'app sono
**JOIN fra liste e dispensa**: cosa manca, cosa scade, cosa è stato comprato.
A queste servono CTE ricorsive, indici parziali e transazioni che coinvolgono
più tabelle — tutte cose che Postgres fa senza pensarci.

Inoltre `UPDATE ... SET quantity = quantity - $1 RETURNING *` è atomico e
tipizzato, ed è il fondamento di come si consuma dalla dispensa (ADR 004).

## Conseguenze

- Un container in più e un volume da includere nei backup.
- Indici parziali (`WHERE deleted_at IS NULL`) che tengono piccoli gli indici
  nonostante i tombstone.
- Nessuna possibilità di eseguire il database dentro il processo: i test di
  integrazione richiedono un Postgres vero, ed è una scelta deliberata —
  verificare il locking ottimistico contro una simulazione proverebbe solo
  che la simulazione funziona.
