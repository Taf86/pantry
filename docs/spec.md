# Pantry — Specifiche tecniche

> Applicazione per la gestione condivisa di liste della spesa e dispense domestiche.
> Versione self-managed su VPS, stack Node.js/TypeScript.

**Stato**: specifica iniziale · **Ultimo aggiornamento**: agosto 2026

---

## 1. Panoramica

Pantry permette a un gruppo ristretto di utenti (famiglia, coinquilini, colleghi) di
gestire liste della spesa condivise e l'inventario delle proprie dispense.

Le due funzionalità sono progettate per parlarsi: la dispensa sa cosa manca, la lista
sa cosa è stato comprato, e al ritorno dal supermercato i prodotti acquistati si
riversano nella dispensa.

### Vincoli progettuali

| Vincolo | Implicazione |
|---|---|
| Uso in supermercato | **Offline-first obbligatorio**: il segnale manca tra gli scaffali |
| Più persone sulla stessa lista | Sincronizzazione real-time e gestione dei conflitti |
| Registrazione non aperta | Nessuno può crearsi un account da solo |
| Nessun invio email in v1 | Onboarding tramite link generato e consegnato a mano |
| Budget ~5 €/mese | VPS singola, nessun servizio gestito a pagamento |
| Sviluppatore singolo, part-time | Un solo linguaggio, minimo numero di componenti |

### Non-obiettivi (v1)

Esplicitamente **fuori scope**, per proteggere la consegna:

- Invio email (inviti, reset password, notifiche)
- Pagamenti, piani, free trial
- Reportistica e analytics
- App native iOS/Android (la PWA basta)
- Scansione codici a barre
- Multi-tenancy o organizzazioni
- Internazionalizzazione (solo italiano)

---

## 2. Stack tecnologico

### Runtime e linguaggio

**TypeScript ovunque**, monorepo pnpm con tre workspace. La ragione non è estetica:
i flag di permesso, la struttura ad albero della dispensa e la forma degli item
esistono su client e server, e definirli due volte è la fonte di bug più prevedibile
del progetto.

```
pantry/
├── apps/
│   ├── api/             # Fastify + tRPC + Drizzle
│   └── web/             # React + Vite (include il backoffice)
├── packages/
│   └── shared/          # schemi Zod, tipi, costanti, logica di permessi
├── docker-compose.yml
├── Caddyfile
├── .env.example
└── docs/
    └── decisions/       # ADR
```

### Componenti

| Livello | Scelta | Motivo |
|---|---|---|
| HTTP server | **Fastify** | processo long-running, ecosistema maturo, nessuna struttura imposta |
| API layer | **tRPC** | type safety end-to-end senza codegen; client unico e in-house |
| ORM | **Drizzle** | inferenza tipi eccellente, migrazioni serie, SQL grezzo per le CTE ricorsive |
| Database | **PostgreSQL 17** | in container, volume dedicato |
| Auth | **Better Auth** | sessioni su Postgres, tabella utenti nostra (serve la colonna `status`) |
| Real-time | **Socket.IO** | riconnessione con backoff su rete mobile ballerina; rooms = liste |
| Frontend | **React 19 + Vite** | |
| Stato server | **TanStack Query v5** | cache persistente + mutation in pausa = offline quasi gratis |
| PWA | **vite-plugin-pwa** | service worker, precache dell'app shell |
| Validazione | **Zod** | condivisa client/server via `packages/shared` |
| Reverse proxy | **Caddy 2** | TLS automatico, serve la SPA, proxy su `/api` |

### Scartati di proposito

- **Redis** — con un processo solo la memoria basta; ciò che deve sopravvivere sta in Postgres
- **Sync engine** (ElectricSQL, PowerSync, Zero) — sovradimensionati, vedi §7
- **GraphQL** — tRPC dà già i tipi end-to-end senza schema separato
- **NestJS** — cerimonia senza contropartita a questa scala

---

## 3. Modello di dominio

### Entità

```
User ──┬── ListMember ──── List ──── ListItem
       │
       └── PantryMember ── Pantry ── PantryNode (albero)

Category (tassonomia condivisa, usata da ListItem e PantryNode)
```

### Schema

```sql
-- ============ Utenti ============

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user','admin')),
  status        TEXT NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited','active','suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Better Auth gestisce: accounts, sessions, verifications

CREATE TABLE invites (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,      -- SHA-256 del token, mai il token
  created_by  TEXT NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

-- ============ Liste ============

CREATE TABLE lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE list_members (
  list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions  INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX idx_list_members_user ON list_members(user_id);

CREATE TABLE list_items (
  id           TEXT PRIMARY KEY,         -- UUID generato dal CLIENT (idempotenza)
  list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  quantity     NUMERIC,
  unit         TEXT,
  category_id  TEXT REFERENCES categories(id),
  note         TEXT,
  checked_at   TIMESTAMPTZ,              -- NULL = da comprare
  checked_by   TEXT REFERENCES users(id),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ               -- tombstone, mai DELETE fisico
);
CREATE INDEX idx_list_items_list ON list_items(list_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_list_items_sync ON list_items(list_id, updated_at);

-- ============ Dispense ============

CREATE TABLE pantries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE pantry_members (
  pantry_id    TEXT NOT NULL REFERENCES pantries(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (pantry_id, user_id)
);

-- Albero a profondità arbitraria: adjacency list.
-- Armadio cucina -> Scaffale 1 -> Cassetto 1 -> Biscotti
CREATE TABLE pantry_nodes (
  id           TEXT PRIMARY KEY,         -- UUID generato dal client
  pantry_id    TEXT NOT NULL REFERENCES pantries(id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES pantry_nodes(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('container','item')),
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- solo per kind='item'
  quantity     NUMERIC,
  unit         TEXT,
  category_id  TEXT REFERENCES categories(id),
  expires_at   DATE,
  min_quantity NUMERIC,                  -- soglia per "manca"
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_pantry_nodes_parent ON pantry_nodes(parent_id);
CREATE INDEX idx_pantry_nodes_pantry ON pantry_nodes(pantry_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pantry_nodes_expiry ON pantry_nodes(pantry_id, expires_at)
  WHERE kind = 'item' AND deleted_at IS NULL;

-- ============ Supporto ============

-- Tassonomia condivisa: serve a ordinare la lista per corsia del supermercato.
-- È trasversale a liste e dispense, quindi vive da sola.
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Idempotenza delle mutazioni offline: vedi §6
CREATE TABLE applied_mutations (
  id          TEXT PRIMARY KEY,          -- UUID generato dal client
  user_id     TEXT NOT NULL REFERENCES users(id),
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_applied_mutations_cleanup ON applied_mutations(applied_at);
```

### Note sullo schema

**Gli ID sono generati dal client.** UUID v7 creato nel browser prima ancora della
chiamata di rete. È il prerequisito dell'offline: l'item esiste e ha identità mentre
sei ancora tra gli scaffali senza segnale, e quando la mutazione parte l'INSERT è
idempotente (`ON CONFLICT DO NOTHING`).

**Nessun DELETE fisico**, solo `deleted_at`. Senza tombstone, un client offline che
riparte non ha modo di sapere che una riga è sparita, e la ricrea.

**`version` su tutto ciò che è modificabile.** È il perno del locking ottimistico
descritto in §6.

**Adjacency list, non closure table.** Una dispensa ha decine di nodi, non milioni:
la CTE ricorsiva è più che sufficiente e lo schema resta leggibile.

---

## 4. Permessi

Modello a bitmask, applicato in modo identico a liste e dispense.

```ts
// packages/shared/src/permissions.ts
export const Permission = {
  None:   0,
  Read:   1 << 0,  // vede il contenuto
  Write:  1 << 1,  // aggiunge, modifica, rimuove
  Shop:   1 << 2,  // spunta come comprato / consuma dalla dispensa
  Manage: 1 << 3,  // gestisce le condivisioni
} as const

export const Role = {
  Viewer:  Permission.Read,
  Shopper: Permission.Read | Permission.Shop,
  Editor:  Permission.Read | Permission.Write | Permission.Shop,
  Owner:   Permission.Read | Permission.Write | Permission.Shop | Permission.Manage,
} as const

export const can = (granted: number, required: number) =>
  (granted & required) === required
```

`Shop` separato da `Write` è il punto: una persona può spuntare i prodotti senza poter
alterare la lista. È la distinzione che rende sensato condividere una lista con
qualcuno a cui chiedi solo di fare la spesa.

**Applicazione**: un middleware tRPC risolve la membership una volta sola e la mette
nel context. Nessun controllo sparso nelle procedure.

```ts
const listProcedure = (required: number) =>
  authedProcedure
    .input(z.object({ listId: z.string() }))
    .use(async ({ ctx, input, next }) => {
      const m = await getMembership(ctx.db, input.listId, ctx.user.id)
      if (!m || !can(m.permissions, required)) throw new TRPCError({ code: 'FORBIDDEN' })
      return next({ ctx: { ...ctx, permissions: m.permissions } })
    })
```

---

## 5. Autenticazione e onboarding (senza email)

### Vincolo

Nessun invio email in v1. Di conseguenza **non esiste auto-registrazione**: gli account
li crea l'amministratore dal backoffice, e il link di attivazione viene consegnato a
mano (WhatsApp, di persona, come capita).

### Flusso di creazione utente

```
1. Admin apre /admin/users, crea l'utente (email + nome)
      → users.status = 'invited'
      → viene generato un token casuale (32 byte)
      → in DB si salva solo SHA-256(token)
2. L'interfaccia mostra UNA SOLA VOLTA l'URL completo:
      https://pantry.dominio.it/invite/<token>
   con un bottone "copia".
3. L'admin lo consegna fuori banda.
4. L'utente apre il link, sceglie una password
      → users.status = 'active'
      → invites.used_at = now()
```

**Parametri**: token monouso, scadenza 7 giorni, rigenerabile dal backoffice se scade
o si perde.

**Reset password**: non self-service. L'admin rigenera un invito dal backoffice e
riconsegna il link. Accettabile con una manciata di utenti.

### Sessioni

Better Auth con sessioni su database. Cookie `httpOnly` + `Secure` + `SameSite=Lax`.

Funziona perché **frontend e API stanno sulla stessa origin** (Caddy serve la SPA e fa
da proxy su `/api`). Questo elimina il CORS, e soprattutto risolve il problema
dell'autenticazione WebSocket: il browser non permette header custom sull'handshake, ma
il cookie parte da solo.

Ogni richiesta fa una lettura sessione su Postgres. A questa scala è irrilevante, e in
cambio la revoca è istantanea.

### Percorso di migrazione (quando arriveranno le email)

Il modello a inviti è già quello giusto: basterà spedire automaticamente lo stesso link
invece di mostrarlo all'admin. Si potrà poi aggiungere `status = 'pending'` per le
auto-registrazioni da approvare — la colonna esiste già nel CHECK.

---

## 6. Concorrenza

Il modello di conflitto reale di questa app è benigno, ma non banale. Ogni tipo di
operazione ha una politica esplicita.

### Politiche per operazione

| Operazione | Politica | Perché |
|---|---|---|
| Spunta / de-spunta item | **LWW** su `checked_at` | idempotente, non può corrompere nulla |
| Aggiunta item | **Insert idempotente** su PK client | due aggiunte concorrenti sono due item, è corretto |
| Modifica nome/quantità | **Locking ottimistico** su `version` | qui il lost update è reale |
| Cancellazione | **Tombstone** (`deleted_at`) | evita la resurrezione da parte di un client offline |
| Spostamento nodo dispensa | **Transazione + controllo cicli** | invariante strutturale, il server è autorevole |
| Consumo da dispensa | **UPDATE relativo** (`quantity = quantity - ?`) | evita il read-modify-write |

L'ultima riga merita attenzione: `SET quantity = quantity - 1` è atomico in Postgres e
non ha bisogno di locking. `SELECT` seguito da `UPDATE quantity = <valore letto> - 1`
è invece la race condition da manuale. La differenza è gratis, basta scriverlo bene.

### Locking ottimistico

```ts
const [updated] = await db.update(listItems)
  .set({ name, quantity, version: sql`version + 1`, updatedAt: new Date() })
  .where(and(
    eq(listItems.id, id),
    eq(listItems.version, expectedVersion),   // <-- il perno
  ))
  .returning()

if (!updated) {
  const current = await db.query.listItems.findFirst({ where: eq(listItems.id, id) })
  throw new TRPCError({
    code: 'CONFLICT',
    cause: { current },        // il client riceve lo stato corrente
  })
}
```

**Comportamento del client sul conflitto**: accetta lo stato del server e mostra una
notifica non bloccante ("qualcuno ha modificato questo prodotto"). Nessun dialogo di
merge manuale — sarebbe sproporzionato per un'app della spesa.

### Idempotenza delle mutazioni

Prerequisito dell'offline: la coda ritenta, e un ritentativo non deve mai applicare
due volte la stessa operazione.

Ogni mutazione porta un `mutationId` (UUID v7 generato dal client). Il server, dentro
la stessa transazione dell'operazione:

```ts
await db.transaction(async (tx) => {
  const seen = await tx.insert(appliedMutations)
    .values({ id: mutationId, userId })
    .onConflictDoNothing()
    .returning()

  if (seen.length === 0) return { deduplicated: true }   // già applicata

  // ... l'operazione vera
})
```

Pulizia: un job che cancella le righe più vecchie di 30 giorni (`pg_boss` o un
semplice `setInterval` all'avvio, non serve altro).

### Invariante dell'albero

Prima di riparentare un nodo, verificare che la destinazione non sia un suo discendente:

```sql
WITH RECURSIVE descendants AS (
  SELECT id FROM pantry_nodes WHERE id = $1        -- nodo che si sposta
  UNION ALL
  SELECT n.id FROM pantry_nodes n
    JOIN descendants d ON n.parent_id = d.id
)
SELECT EXISTS (SELECT 1 FROM descendants WHERE id = $2) AS would_cycle;
```

Il controllo e lo spostamento stanno nella stessa transazione.

---

## 7. Offline

### Perché non un sync engine

ElectricSQL, PowerSync, Zero e simili risolvono la sincronizzazione locale-first in
blocco. Per questa app sono sovradimensionati: il modello di conflitto (vedi §6) è
risolvibile con LWW e locking ottimistico, senza CRDT.

Il codice da scrivere è nell'ordine delle 200 righe, ed è codice **debuggabile**. Un
sync engine che si comporta in modo strano alle undici di sera è un problema molto
peggiore di 200 righe che hai scritto tu.

### Meccanica

**Cache persistente**

```ts
persistQueryClient({
  queryClient,
  persister: createAsyncStoragePersister({ storage: idbStorage }),
  maxAge: 1000 * 60 * 60 * 24 * 7,
})
```

**Coda di mutazioni**

TanStack Query mette in pausa le mutation quando è offline e le riprende alla
riconnessione. Perché sopravvivano a un riavvio dell'app serve:

- `queryClient.setMutationDefaults()` con `mutationFn` registrate per chiave, così
  le mutation ripristinate da IndexedDB sanno cosa eseguire
- `queryClient.resumePausedMutations()` all'avvio
- ordine FIFO, per non applicare una modifica prima della creazione

**Aggiornamenti ottimistici**

Ogni mutazione applica subito il cambiamento alla cache. Con gli ID generati dal client
non serve nessuna riconciliazione di ID temporanei al ritorno del server.

**Riconnessione**

Al ritorno online: refetch completo delle liste attive. A questa scala (decine di item)
è più semplice e più robusto di un delta sync, e costa qualche kilobyte.

> Ottimizzazione futura, quando servirà: endpoint `sync.since(listId, timestamp)` che
> restituisce le righe con `updated_at > timestamp`, tombstone inclusi. L'indice
> `idx_list_items_sync` esiste già per questo.

### Modalità spesa

Prima di entrare in modalità spesa, il client **precarica esplicitamente** tutte le
liste su cui l'utente ha `Shop` e le tiene in cache. Da quel momento l'app è
completamente funzionale senza rete: spunti, e le mutazioni si accodano.

Indicatore di stato sempre visibile: `online` / `offline, N modifiche in coda` /
`sincronizzazione…`.

### Service worker

`vite-plugin-pwa` in modalità `generateSW`. Precache dell'app shell,
`NetworkFirst` sulle API con fallback alla cache. **Escludere `/api/auth/*`** dal
caching per non servire risposte di sessione stantie.

---

## 8. Real-time

**Socket.IO**, un namespace, una room per lista (`list:<id>`) e una per dispensa
(`pantry:<id>`).

La scelta di Socket.IO invece di `ws` nudo è motivata da una cosa sola: la
riconnessione con backoff su rete mobile instabile, gestita bene. È letteralmente
lo scenario del supermercato.

### Divisione dei canali

- **tRPC su HTTP** → tutte le query e le mutazioni (richiesta/risposta)
- **Socket.IO** → solo push server→client

Il socket non trasporta mai mutazioni. Riceve solo eventi di notifica, che il client
usa per aggiornare la cache di TanStack Query:

```ts
type ServerEvent =
  | { type: 'item.upserted'; listId: string; item: ListItem }
  | { type: 'item.deleted';  listId: string; itemId: string }
  | { type: 'list.updated';  listId: string; list: List }
  | { type: 'pantry.node.upserted'; pantryId: string; node: PantryNode }
  | { type: 'pantry.node.deleted';  pantryId: string; nodeId: string }
```

Due canali invece di uno è una scelta deliberata: tRPC dà tipi e validazione sul
percorso critico, Socket.IO dà riconnessione robusta sul percorso di notifica. Le
subscription tRPC unificherebbero, ma sono meno mature e perderebbero il backoff.

### Autenticazione del socket

Il cookie di sessione viaggia con l'handshake (stessa origin). Il server lo valida in
`io.use()` e rifiuta la connessione se assente o scaduto. L'ingresso in una room
verifica la membership.

### Modalità multi-lista

Il client apre la connessione una volta e fa `join` su tutte le room delle liste che
sta guardando. La **vista unificata è una fusione lato client**: il server non sa che
esiste una "sessione di spesa", e ogni scrittura resta indirizzata alla sua lista.

**Duplicati**: non deduplicare. Se il latte è in due liste, si mostrano due righe
etichettate con la lista di origine, raggruppate visivamente. Semplice batte furbo, e
la semantica resta onesta.

**Ordinamento**: per `categories.sort_order`, così la lista fusa segue le corsie del
supermercato invece di un ordine casuale.

---

## 9. API

Router tRPC. Solo la superficie, non le firme complete.

```
auth.*                    (gestito da Better Auth, fuori da tRPC)

lists.list                                 → liste dell'utente con permessi
lists.get / create / update / delete
lists.share               (Manage)         → aggiunge/modifica un membro
lists.unshare             (Manage)

items.add                 (Write)          → { id, mutationId, ... }
items.update              (Write)          → richiede `version`
items.check / uncheck     (Shop)           → LWW, idempotente
items.delete              (Write)          → tombstone

shopping.session          (Shop)           → fan-out sulle liste shoppabili
shopping.checkMany        (Shop)           → batch, per lo svuotamento della coda

pantries.*                                 → simmetrico a lists.*
nodes.tree                (Read)           → CTE ricorsiva, albero completo
nodes.create / update / delete  (Write)
nodes.move                (Write)          → transazione + controllo cicli
nodes.consume             (Shop)           → UPDATE relativo sulla quantità

pantry.missing            (Read)           → item sotto min_quantity
pantry.expiring           (Read)           → in scadenza entro N giorni
pantry.toList             (Write)          → genera item di lista dai mancanti
shopping.toPantry         (Write)          → riversa i comprati nella dispensa

admin.users.list          (admin)
admin.users.create        (admin)          → restituisce il token UNA volta
admin.users.regenerateInvite (admin)
admin.users.setStatus     (admin)          → sospendi / riattiva
admin.users.setRole       (admin)
```

Tutte le procedure `admin.*` passano da un `adminProcedure` che verifica
`ctx.user.role === 'admin'` **lato server**. Nascondere la UI non è autorizzazione.

---

## 10. Backoffice

Non è un'applicazione separata: è una rotta `/admin` nella stessa SPA, protetta da
route guard lato client e da `adminProcedure` lato server.

Una seconda app significherebbe un secondo build, un secondo deploy e un secondo
sistema di autenticazione, in cambio di nulla.

### Schermate

**`/admin/users`** — tabella con email, nome, stato, ruolo, ultimo accesso.
Azioni: crea utente, rigenera invito, sospendi/riattiva, cambia ruolo.

**Modale di creazione** — email + nome + ruolo. Al submit mostra il link di invito
in un blocco copiabile, con l'avviso che non sarà più recuperabile e che va
rigenerato in caso di perdita.

**`/admin/lists`** (opzionale, fase 3) — elenco liste e dispense con proprietario e
numero di membri, per diagnostica.

Il primo admin si crea con uno script di seed eseguito una volta
(`pnpm --filter api seed:admin`).

---

## 11. Deployment

### Topologia

```
Internet
   │
   ├── Cloudflare (DNS, free plan) — nasconde l'IP, DDoS
   │
   └── VPS Hetzner CX22 (2 vCPU, 4 GB, 40 GB NVMe)
         └── Docker Compose
               ├── caddy    :80 :443   → TLS, serve /srv, proxy /api e /socket.io
               ├── api      (interno)  → Fastify
               └── db       (interno)  → Postgres 17, volume pgdata
```

### docker-compose.yml

```yaml
services:
  db:
    image: postgres:17.5              # versione FISSATA, mai :latest
    restart: unless-stopped
    environment:
      POSTGRES_USER: pantry
      POSTGRES_DB: pantry
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?manca in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pantry -d pantry"]
      interval: 10s
      retries: 5
    # NESSUNA sezione ports: 5432 non deve mai affacciarsi su internet

  api:
    image: ghcr.io/<user>/pantry-api:${TAG:?manca il tag}
    restart: unless-stopped
    env_file: [.env]
    depends_on:
      db: { condition: service_healthy }

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    environment:
      DOMAIN: ${DOMAIN:?manca in .env}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./dist:/srv
      - caddy_data:/data
    depends_on: [api]

volumes: { pgdata: , caddy_data: }
```

La sintassi `${VAR:?messaggio}` è importante: senza, una variabile mancante diventa
stringa vuota e il deploy riesce silenziosamente con un database senza password.

### Caddyfile

```
{$DOMAIN} {
    encode gzip zstd

    handle /api/* {
        reverse_proxy api:3000
    }
    handle /socket.io/* {
        reverse_proxy api:3000
    }
    handle {
        root * /srv
        try_files {path} /index.html      # SPA fallback
        file_server
    }
}
```

Stessa origin per SPA e API: è il presupposto di tutto il modello di autenticazione.

### CI/CD

```yaml
name: deploy
on: { push: { branches: [main] } }

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck && pnpm -r test
      - run: pnpm --filter web build

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ./packages/api/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}-api:${{ github.sha }}

      - name: Copia la SPA
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SSH_HOST }}
          username: deploy
          key: ${{ secrets.SSH_KEY }}
          source: "packages/web/dist/*"
          target: "/opt/pantry/dist"
          strip_components: 3

      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: deploy
          key: ${{ secrets.SSH_KEY }}
          script: |
            echo "TAG=${{ github.sha }}" > /opt/pantry/.env.tag
            /opt/pantry/deploy.sh
```

Tag = SHA del commit, mai `latest`: sai sempre cosa gira, e il rollback è scrivere il
SHA precedente in `.env.tag` e rilanciare.

Repo **pubblico**: minuti Actions illimitati e nessun tetto sullo storage GHCR.

### Migrazioni

Drizzle, eseguite all'avvio del container `api` prima che il server accetti traffico.
Solo migrazioni additive (mai `DROP COLUMN` in un deploy che deve poter tornare
indietro).

---

## 12. Segreti

Tre posti, nessun altro.

| Dove | Cosa |
|---|---|
| **Password manager** | copia di riferimento di tutto + chiave SSH + credenziali Hetzner |
| **`/opt/pantry/.env`** (chmod 600) | i segreti in esecuzione, scritti a mano una volta |
| **GitHub Actions Secrets** | solo `SSH_HOST` e `SSH_KEY` |

Nel repo pubblico va solo `.env.example` con le chiavi e valori fittizi.

```bash
# /opt/pantry/.env
POSTGRES_PASSWORD=          # openssl rand -base64 32
BETTER_AUTH_SECRET=         # openssl rand -base64 32
VAPID_PUBLIC_KEY=           # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
DOMAIN=pantry.dominio.it
```

`DATABASE_URL` **non** è nel file: si compone nel codice da `POSTGRES_PASSWORD`,
altrimenti la password vive in due posti e la rotazione ne dimentica uno.

`.env` è scritto solo a mano; `.env.tag` solo dalla CI. Nessuna automazione tocca il
file dei segreti.

**Reti di sicurezza**: push protection di GitHub attiva, `gitleaks` come pre-commit
hook, e — visto che il repo nasce pubblico — nessuna storia pregressa da bonificare.

---

## 13. Backup e operatività

| Cosa | Come | Frequenza |
|---|---|---|
| Dump logico | `pg_dump -Fc` cifrato → Cloudflare R2 o Backblaze B2 | notturno, retention 30gg |
| Snapshot macchina | backup automatici Hetzner (20% del prezzo istanza) | giornaliero, 7 copie |
| **Prova di restore** | ripristino in container di scarto, conteggio righe | **trimestrale** |

Il backup off-site deve stare **fuori dalla macchina**: uno sullo stesso disco non
protegge dal caso in cui il disco è il problema. Un backup mai ripristinato non è un
backup, è una speranza.

**Monitoraggio minimo**: check di uptime esterno (UptimeRobot / Healthchecks.io),
alert sullo spazio disco sopra l'80% — il disco pieno è il secondo modo più comune di
perdere un database — e Sentry free per gli errori applicativi.

**Log**: Pino strutturato, rotazione dei log Docker configurata subito
(`max-size: 10m`, `max-file: 3`).

---

## 14. Roadmap

Fasi ordinate per rilasciare qualcosa di usabile presto. Ogni fase è deployabile.

### Fase 1 — Fondamenta
Monorepo, Docker Compose, Caddy, CI/CD, Better Auth, schema utenti, backoffice
minimo (crea utente + link invito), pagina di attivazione. **Risultato**: si può
fare login.

### Fase 2 — Liste
CRUD liste e item, condivisione con permessi, UI base. Nessun offline, nessun
real-time. **Risultato**: l'app è utile.

### Fase 3 — Real-time
Socket.IO, rooms, eventi, integrazione con TanStack Query. **Risultato**: due
persone si vedono a vicenda.

### Fase 4 — Offline
PWA, service worker, cache persistente, coda di mutazioni, idempotenza,
locking ottimistico, indicatore di stato. **Risultato**: funziona al supermercato.
*Fase più rischiosa: da fare quando il resto è stabile.*

### Fase 5 — Modalità spesa
Vista multi-lista fusa, ordinamento per categoria, precarico esplicito.

### Fase 6 — Dispensa
Albero, CTE ricorsiva, spostamenti con controllo cicli, scadenze, soglie.

### Fase 7 — Il ponte
`pantry.toList`, `shopping.toPantry`, avvisi di scadenza via Web Push.
**È qui che l'app diventa interessante** — le due metà iniziano a parlarsi.

---

## 15. Decisioni architetturali

Da espandere in `docs/decisions/`. Per un progetto da mettere sul CV, il ragionamento
vale più del codice: dimostra la capacità di valutare alternative e scartarle con
criterio.

| # | Decisione | Alternativa scartata | Motivo |
|---|---|---|---|
| 001 | VPS self-managed | Cloudflare Workers + D1 + Durable Objects | i confini dei DO tagliano trasversalmente rispetto alle funzionalità: analytics, spesa multi-lista, ponte lista↔dispensa. Tre indizi nella stessa direzione |
| 002 | PostgreSQL | D1 / SQLite | le funzionalità interessanti sono JOIN tra liste e dispensa |
| 003 | TypeScript ovunque | Kotlin/Spring, Rust | la risorsa scarsa è il tempo dello sviluppatore; tipi condivisi client/server |
| 004 | LWW + locking ottimistico | CRDT / sync engine | il modello di conflitto è benigno; 200 righe debuggabili battono una dipendenza opaca |
| 005 | ID generati dal client | ID dal server + riconciliazione | prerequisito dell'offline e dell'idempotenza |
| 006 | Socket.IO | `ws` nudo, tRPC subscriptions | riconnessione con backoff su rete mobile |
| 007 | Backoffice nella stessa SPA | app separata | secondo build e secondo auth in cambio di nulla |
| 008 | Inviti manuali | email transazionali | fuori scope in v1; il modello a token è già quello giusto per migrare |
| 009 | Adjacency list | closure table, `ltree` | decine di nodi, non milioni |
| 010 | Repo pubblico dal primo commit | privato poi aperto | nessuna storia da bonificare, Actions illimitate |

---

## 16. Costi

| Voce | Netto | Note |
|---|---|---|
| VPS Hetzner CX22 | ~€4,35/mese | prezzi al netto IVA (22% da privato in Italia) |
| Dominio | ~€12/anno | ≈ €1/mese |
| Backup automatici Hetzner | ~€0,87/mese | 20% del prezzo istanza |

**Totale realistico: ~6-7 €/mese IVA inclusa**, circa 80 € l'anno.

Gratis a questa scala: TLS (Let's Encrypt), DNS/CDN/DDoS (Cloudflare free), backup
off-site (R2 10 GB), CI (Actions su repo pubblico), error tracking (Sentry free),
uptime (UptimeRobot), Web Push (VAPID, nessun servizio).

**Costo non monetario**: mezza giornata di setup iniziale, poi circa un'ora al mese di
manutenzione tra patch di sistema e verifica dei backup. È la differenza reale rispetto
a un PaaS, che costerebbe 20-25 $/mese.
