# Pantry

Liste della spesa e dispense condivise, pensate per funzionare **anche quando
la rete non c'è** — perché fra gli scaffali del supermercato, di norma, non c'è.

Le due metà dell'applicazione sono progettate per parlarsi: la dispensa sa cosa
manca, la lista sa cosa è stato comprato, e al ritorno dal supermercato i
prodotti acquistati si riversano nella dispensa.

Specifica completa: [`docs/spec.md`](./docs/spec.md) ·
Decisioni architetturali: [`docs/decisions`](./docs/decisions)

---

## Cosa fa

- **Liste condivise** con permessi a bitmask. `Shop` è separato da `Write`: si
  può chiedere a qualcuno di fare la spesa senza dargli la facoltà di
  cambiare la lista.
- **Modalità spesa**: tutte le liste su cui hai `Shop`, fuse in un'unica vista
  ordinata per corsia del supermercato. I duplicati non si deduplicano — se il
  latte è in due liste, restano due righe etichettate.
- **Offline-first**: cache persistita su IndexedDB, coda di mutazioni che
  sopravvive al riavvio dell'app, aggiornamenti ottimistici, indicatore di
  stato sempre visibile.
- **Real-time**: due persone sulla stessa lista si vedono a vicenda.
- **Dispensa ad albero**: armadio → scaffale → cassetto → biscotti, con
  soglie di riordino e scadenze.
- **Il ponte**: i prodotti sotto soglia diventano item di lista; i prodotti
  comprati diventano giacenza in dispensa.
- **Backoffice** per creare utenti e generare i link di attivazione, con la coda
  delle richieste di registrazione da approvare.

## Architettura

```
pantry/
├── apps/
│   ├── api/          Fastify + tRPC + Drizzle + Better Auth + Socket.IO
│   └── web/          React 19 + Vite + TanStack Query (include /admin)
├── packages/
│   └── shared/       schemi Zod, permessi, logica di dominio condivisa
├── docker-compose.dev.yml     Postgres per lo sviluppo locale
├── docker-compose.yml  produzione: Caddy + API + Postgres
├── Caddyfile
└── docs/
    ├── spec.md
    └── decisions/    ADR
```

`packages/shared` non è una cartella di utilità: contiene ciò che **deve
valere identico** su client e server — la forma degli item, i flag di
permesso, la risoluzione dei conflitti, l'ordinamento della spesa. Definirlo
due volte sarebbe la fonte di bug più prevedibile del progetto.

| Livello       | Scelta            | Perché                                                       |
| ------------- | ----------------- | ------------------------------------------------------------ |
| HTTP          | Fastify           | processo long-running, nessuna struttura imposta             |
| API           | tRPC              | tipi end-to-end senza codegen                                |
| ORM           | Drizzle           | inferenza dei tipi, migrazioni serie, SQL grezzo per le CTE  |
| Database      | PostgreSQL 17     | le funzionalità interessanti sono JOIN fra liste e dispensa  |
| Auth          | Better Auth       | sessioni su Postgres, tabella utenti nostra (serve `status`) |
| Real-time     | Socket.IO         | riconnessione con backoff su rete mobile                     |
| Stato client  | TanStack Query v5 | cache persistente + mutation in pausa = offline quasi gratis |
| Reverse proxy | Caddy 2           | TLS automatico, SPA e API sulla stessa origin                |

## Sviluppo

Requisiti: Node 22+, pnpm 9, e un PostgreSQL raggiungibile.

**1. Dipendenze e configurazione.** Copia `.env.example` in `.env` alla radice
e scommenta il blocco "sviluppo locale". L'API lo carica da sola, quindi non
c'è niente da esportare a mano — e funziona identico su bash e su PowerShell.

```bash
pnpm install
cp .env.example .env
```

**2. Il database.** O con il compose di sviluppo, che contiene il solo Postgres:

```bash
pnpm db:up
```

O con un PostgreSQL già installato: crea il database `pantry` e allinea
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER` e `POSTGRES_PASSWORD` nel
`.env`. Le migrazioni le applica l'API all'avvio, non serve preparare nulla.

**3. Il primo amministratore.** Nessun account nasce da solo, e una richiesta di
registrazione ha bisogno di qualcuno che la approvi: l'account iniziale si crea
qui, e il comando stampa il link di attivazione.

```bash
pnpm seed:admin -- --email tu@esempio.it --name "Il tuo nome"
```

**4. Avvio.**

```bash
pnpm dev
```

L'app è su <http://localhost:5173>. Apri il link di attivazione, scegli una
password, e sei dentro.

Vite fa da proxy verso l'API sulla 3000, così il browser vede una sola origin
esattamente come in produzione dietro Caddy. Non è un dettaglio di comodità:
il cookie di sessione e l'autenticazione dell'handshake WebSocket dipendono
interamente da questo, ed è il motivo per cui `DOMAIN` in sviluppo vale
`localhost:5173` e non la porta dell'API.

Per fermare e ripulire il database: `pnpm db:down`.

### Comandi

| Comando                                | Cosa fa                                    |
| -------------------------------------- | ------------------------------------------ |
| `pnpm dev`                             | avvia API e SPA in watch                   |
| `pnpm db:up` / `pnpm db:down`          | Postgres di sviluppo, su e giù             |
| `pnpm build`                           | compila tutti i workspace                  |
| `pnpm check-types`                     | verifica dei tipi                          |
| `pnpm lint`                            | ESLint + Prettier                          |
| `pnpm test`                            | test unitari e di integrazione             |
| `pnpm --filter pantry-api db:generate` | genera una migrazione dallo schema Drizzle |
| `pnpm seed:admin`                      | crea o rigenera il primo amministratore    |

### Test

I test unitari girano ovunque, senza dipendenze esterne. Le suite di
integrazione dell'API richiedono un Postgres vero e si **saltano
automaticamente** se `POSTGRES_PASSWORD` non è impostata, così un checkout
appena clonato resta verde. Basta `pnpm db:up` e un `.env` perché si attivino
da sole.

Non c'è un finto database, ed è deliberato: le invarianti che contano in
questa applicazione — locking ottimistico, `ON CONFLICT DO NOTHING`, CTE
ricorsive, `UPDATE` relativi — _sono_ comportamento del database. Verificarle
contro una simulazione proverebbe solo che la simulazione funziona.

## Deployment

Una VPS, tre container: Caddy, API, Postgres.

```bash
# sulla macchina, una volta sola
mkdir -p /opt/pantry && cd /opt/pantry
cp .env.example .env && chmod 600 .env   # poi riempilo a mano
```

Poi ogni push su `main` fa il resto: la CI compila, esegue i test, pubblica
l'immagine su GHCR taggata con il SHA del commit, copia la SPA e lancia
`deploy.sh`.

Il tag è **sempre il SHA**, mai `latest`: sai sempre cosa gira, e il rollback
è scrivere il SHA precedente in `.env.tag` e rilanciare `deploy.sh`.

Le migrazioni le applica il container `api` all'avvio, prima di accettare
traffico. Solo migrazioni additive: un deploy deve poter tornare indietro.

### Segreti

Tre posti, nessun altro: il password manager, `/opt/pantry/.env` (chmod 600,
scritto solo a mano), e i GitHub Actions Secrets — dove stanno unicamente
`SSH_HOST` e `SSH_KEY`.

`DATABASE_URL` non è fra questi: si compone nel codice da `POSTGRES_PASSWORD`.
Se la password vivesse in due posti, prima o poi la rotazione ne
dimenticherebbe uno.

## Stato

Le fasi 1-7 della roadmap sono implementate: fondamenta, liste, real-time,
offline, modalità spesa, dispensa e il ponte fra le due metà. Le notifiche
Web Push per le scadenze restano l'unico pezzo della fase 7 non ancora
realizzato; le chiavi VAPID sono già previste in `.env.example`.

## Licenza

Copyright (C) 2026 Davide Casadei

Pantry è software libero: puoi ridistribuirlo e modificarlo secondo i termini
della GNU Affero General Public License, versione 3 o (a tua scelta) qualunque
versione successiva, come pubblicata dalla Free Software Foundation. Il testo
completo è in [LICENSE](./LICENSE).

In pratica: se esegui una versione modificata di Pantry come servizio di rete,
devi rendere disponibile ai suoi utenti il codice sorgente completo della tua
versione.
