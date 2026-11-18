# Item delle liste, prodotti e spesa — design

> Stato: **decisioni prese, pronto per l'implementazione**. Sostituisce, per
> quanto riguarda item delle liste e modalità spesa, quanto scritto in
> `docs/spec.md`. Le decisioni prese sono riepilogate in fondo (§11).

## 1. Obiettivi

1. **Inserimento rapido**: l'utente scrive testo libero ("2 kg mele",
   "latte", "prosciutto 2 etti"); mentre scrive compaiono suggerimenti presi
   dai prodotti già usati nel tenant, completi di categoria, quantità e unità.
2. **Dato strutturato**: ogni item diventa `prodotto + quantità? + unità? +
   categoria?`. Se il testo non corrisponde a nulla di noto, il server chiede a
   un modello AI gratuito di strutturarlo, passandogli i prodotti candidati per
   evitare duplicati. L'utente può sempre correggere il risultato, e la
   correzione viene "imparata".
3. **Spesa coordinata**: una lista è presa in carico da **una sola persona alla
   volta**. Il claim richiede la rete; durante la spesa l'app funziona offline;
   fine spesa, scadenza e interruzione sono robusti rispetto alla disconnessione.

Vincoli trasversali (già in vigore nel codebase):

- ogni tabella di dominio porta `tenant_id` **esplicito** con FK composite
  `(id, tenant_id)` come `lists` / `list_members`;
- id generati dal client con `uuidv7` (permettono la creazione offline);
- mutazioni idempotenti via `mutationId` + `applied_mutations`;
- nessun toast di successo: solo errori.

## 2. Analisi delle entità

| Entità proposta | Necessaria? | Note |
|---|---|---|
| `category` | Sì | Lookup seedato. Serve a raggruppare e ordinare la lista per corsia. |
| `unit` (um) | Sì | Lookup seedato. Serve al parser, all'AI e alla validazione delle quantità. |
| `product` | Sì | Catalogo **per tenant**: è la sorgente dei suggerimenti. |
| `list_item` | Sì | Istanza di un prodotto in una lista, con quantità/unità e stato di spunta. |
| `shopping_session` | Sì | Il claim. Una riga per lista presa in carico. |
| **`product_alias`** | **Aggiunta** | Mappa "testo normalizzato → prodotto". Sostituisce la singola "stringa che ha generato il prodotto": più testi diversi ("latte", "latte ps", "latte parz. scremato") portano allo stesso prodotto, e ogni correzione dell'utente aggiunge/aggiorna un alias. È la cache che evita di richiamare l'AI per testi già visti. |

Valutate e **non** introdotte ora:

- **Ordine delle categorie per supermercato/tenant**: non previsto. L'ordine
  è unico per tutti ed è il `sort_order` seedato.
- **Storico acquisti**: per i suggerimenti bastano `use_count`/`last_used_at`
  sul prodotto. Uno storico vero servirà al "ponte" verso la dispensa; si
  aggancia alla chiusura della sessione (§7.3) senza toccare il resto.
- **Cache AI globale (cross-tenant)**: risparmierebbe quota, ma fa uscire il
  testo di un tenant dal suo perimetro. Per ora l'alias è per tenant.
- **Sessione multi-lista come entità unica**: un utente può prendere in carico
  più liste insieme, ma il vincolo di unicità è per lista, quindi basta una
  riga per lista; il raggruppamento è solo lato client (§7.1).

## 3. Lookup seedati: `category` e `unit`

Sorgente di verità: costanti in `@pantry/shared` (codici, ordine, attributi),
come già avviene per `UserRoles`. Il DB ha tabelle lookup popolate dalla
migrazione, per avere FK e per poterle leggere in SQL; un test verifica che DB
e costanti coincidano. Le traduzioni sono solo lato client:
`category.<code>` e `unit.<code>` in `it.json` / `en.json`.

### 3.1 `categories`

| Colonna | Tipo | Note |
|---|---|---|
| `code` | text PK | inglese, snake_case, stabile |
| `sort_order` | int not null | ordine "giro del supermercato" di default |

Seed proposto (in ordine di corsia tipica):

| code | it |
|---|---|
| `produce` | Frutta e verdura |
| `bakery` | Pane e forno |
| `deli` | Gastronomia e salumi |
| `meat` | Carne |
| `fish` | Pesce |
| `dairy` | Latticini e uova |
| `pasta_rice` | Pasta e riso |
| `baking` | Farine, zucchero e preparati per dolci |
| `pantry` | Conserve, sughi e condimenti |
| `breakfast` | Colazione |
| `snacks` | Dolci e snack |
| `beverages` | Bevande |
| `frozen` | Surgelati |
| `household` | Casa e pulizia |
| `personal_care` | Igiene e cura persona |
| `baby` | Infanzia |
| `pets` | Animali |
| `other` | Altro |

### 3.2 `units`

| Colonna | Tipo | Note |
|---|---|---|
| `code` | text PK | |
| `kind` | text | `count` \| `mass` \| `volume` (abilita eventuali conversioni future) |
| `allows_decimal` | bool | `pc` no, `kg` sì |
| `sort_order` | int | ordine nel selettore |

Seed: `pc` (pezzi), `g`, `hg` (etto — comune al banco), `kg`, `ml`, `cl`,
`l`.

Niente unità "contenitore" (bottiglia, confezione, lattina, vasetto…): i
contenitori si contano in `pc`, e la parola contenitore entra nel nome del
prodotto **solo se è essenziale** per identificarlo. "2 confezioni di
biscotti" → prodotto "Biscotti", `2 pc`; "bottiglia d'acqua" → prodotto
"Bottiglia d'acqua", `1 pc`. Decidere se il contenitore è essenziale è un
giudizio: lo applicano l'alias (testo già visto) e l'AI, e l'utente può
sempre correggere. Il parser locale non tocca le parole contenitore e le
lascia nel testo così com'è.

Gli alias testuali delle unità per il parser ("kg", "chili", "etti", "hg",
"pz", "pezzi", "lt", "litri", …) vivono in `@pantry/shared` accanto alle
costanti, non nel DB.

## 4. Modello dati

### 4.1 `products`

Catalogo per tenant. Un prodotto è "cosa" si compra, non "quanto".

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | text not null | FK `tenants` |
| `name` | text not null | nome canonico mostrato ("Latte parzialmente scremato") |
| `normalized_name` | text not null | `normalize(name)`; unique `(tenant_id, normalized_name)` |
| `category_code` | text null | FK `categories` |
| `last_quantity` | numeric(10,3) null | ultima quantità usata → proposta nei suggerimenti |
| `last_unit_code` | text null | FK `units` |
| `origin` | text | `user` \| `ai` — da dove è nato |
| `use_count` | int not null default 0 | ranking suggerimenti |
| `last_used_at` | timestamptz | ranking suggerimenti |
| `created_by`, `created_at`, `updated_at` | | `updated_at` serve alla sync incrementale |

Indici: unique `(tenant_id, normalized_name)`, GIN trigram su
`normalized_name` (estensione `pg_trgm`, inclusa nell'immagine `postgres:17`).

### 4.2 `product_aliases`

| Colonna | Tipo | Note |
|---|---|---|
| `tenant_id` | text | |
| `normalized_text` | text | testo dell'utente **senza** quantità/unità, normalizzato |
| `product_id` | uuid | FK composita `(product_id, tenant_id)` → `products`, cascade |
| `source` | text | `exact` \| `ai` \| `user_correction` |
| `created_at`, `updated_at` | | |

PK `(tenant_id, normalized_text)`: un testo porta a un solo prodotto. Una
correzione dell'utente sovrascrive l'alias (`source = user_correction`, che ha
precedenza e non viene più toccato dall'AI).

### 4.3 `list_items`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | generato dal client |
| `tenant_id`, `list_id` | | FK composita su `lists`, cascade |
| `raw_text` | text not null | ciò che l'utente ha scritto, sempre conservato |
| `product_id` | uuid null | null finché la risoluzione non è avvenuta |
| `quantity` | numeric(10,3) null | > 0, ≤ `MAX_QUANTITY` |
| `unit_code` | text null | FK `units`; richiede `quantity` non null |
| `note` | text null | ≤ `MAX_NOTE_LENGTH` ("quello in offerta") |
| `resolution` | text not null | `pending` \| `resolved` \| `failed` \| `manual` |
| `checked_at` | timestamptz null | spuntato = nel carrello |
| `checked_by` | text null | utente |
| `checked_session_id` | uuid null | FK `shopping_sessions`, set null |
| `created_by`, `created_at`, `updated_at` | | |

Note:

- **La categoria non sta sull'item**: è del prodotto. Correggerla da un item
  corregge il prodotto per tutto il tenant (è quasi sempre quello che si
  vuole: "le uova vanno in latticini"). Un item senza prodotto (pending/failed)
  finisce in `other`.
- Il nome mostrato è `product.name`, con fallback a `raw_text`.
- Ordinamento lista: non spuntati prima, poi per `categories.sort_order`, poi
  per nome. Niente ordinamento manuale per ora. Durante la spesa si vedono
  **tutti** gli item, spuntati compresi (in fondo).
- **Duplicati**: se il prodotto scelto è già presente non spuntato, la UI lo
  segnala nel suggerimento ("già in lista · 1 l") e propone di modificare la
  quantità invece di aggiungere; se è presente spuntato, lo segnala come
  "già nel carrello" senza proporre nulla. Il server non fonde in automatico.
- **Invariante**: un item spuntato esiste solo finché sulla lista c'è una
  sessione attiva. Qualsiasi chiusura di sessione elimina gli item spuntati
  (§7.3); non esiste archivio, lo storico utile è nel catalogo
  (`products`, `product_aliases`, `use_count`, `last_*`).
- Aggiornare o eliminare un item che non esiste più è un **no-op
  silenzioso**, non un errore: succede quando una mutazione offline arriva
  dopo che una chiusura di sessione ha eliminato l'item.

### 4.4 `shopping_sessions`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `list_id` | | FK composita su `lists`, cascade |
| `user_id` | text | FK composita su `users` |
| `started_at` | timestamptz | |
| `last_seen_at` | timestamptz | aggiornato con l'ora del **server** a ogni contatto |
| `ended_at` | timestamptz null | |
| `end_reason` | text null | `completed` \| `expired` \| `interrupted` \| `revoked` |
| `ended_by` | text null | chi l'ha chiusa (il manager, in caso di interruzione) |

La sessione appartiene all'**utente**, non al dispositivo: qualsiasi
dispositivo dello stesso utente può usarla.

Vincolo cardine: **unique parziale su `list_id` where `ended_at is null`**. È
la garanzia ultima di "un solo acquirente per lista", indipendente da qualsiasi
logica applicativa o race. Le sessioni chiuse si cancellano dopo
`SHOPPING_SESSION_RETENTION_DAYS` (job di cleanup esistente).

## 5. Inserimento rapido

### 5.1 Normalizzazione e parser locale (shared)

In `@pantry/shared`, usate identiche da client e server:

- `normalizeText(s)`: minuscolo, trim, spazi compressi, accenti rimossi,
  punteggiatura non significativa rimossa.
- `parseItemText(s) → { name, quantity?, unitCode? }`: grammatica
  deterministica per i casi comuni:
  - `2 kg mele`, `1,5 l latte`, `6 uova`, `mele 2kg`, `latte x2`,
    `prosciutto 2 etti`, `mezzo kg pane` (pochi numerali in lettere);
  - le unità si riconoscono dagli alias di §3.2;
  - le parole contenitore non sono unità: "2 confezioni di biscotti" →
    `quantity = 2`, nessuna unità, nome "confezioni di biscotti"; sono poi
    l'alias o l'AI a scegliere il prodotto ("Biscotti") e l'unità (`pc`);
  - se non riconosce nulla restituisce `{ name: s }`.
- Incollare più righe o elementi separati da virgola crea più item.

### 5.2 Suggerimenti (offline-first, lato client)

Il catalogo prodotti del tenant (prodotti + alias) è piccolo (centinaia,
qualche migliaio di righe) e viene **sincronizzato sul client** e persistito
come le altre query: prima volta completo, poi incrementale per `updated_at`.
I suggerimenti si calcolano quindi in locale, a ogni tasto, senza rete:

1. `parseItemText` separa quantità/unità dal nome;
2. match sul nome normalizzato: prefisso sui token del nome e degli alias,
   poi sottostringa; ranking per qualità del match, `use_count`,
   `last_used_at`;
3. ogni suggerimento mostra nome, categoria e `last_quantity last_unit`
   (sovrascritti da quantità/unità digitate, se presenti) e l'indicazione
   "già in lista" o "già nel carrello" (§4.3).

Scegliere un suggerimento crea l'item **già risolto** (`product_id`
valorizzato, `resolution = resolved`), anche offline.

### 5.3 Testo libero: pipeline di risoluzione (server)

Se l'utente conferma il testo senza scegliere un suggerimento, il client crea
subito l'item con `raw_text`, quantità/unità dal parser locale e
`resolution = pending` (funziona offline: la mutazione va in coda). Quando la
mutazione arriva al server, la risoluzione procede così, fermandosi al primo
esito:

1. **Alias esatto** su `(tenant_id, normalizeText(name))` → risolto.
2. **Nome prodotto esatto** su `normalized_name` → risolto, crea alias `exact`.
3. **Candidati per similarità** (trigram, top 8 sopra una soglia minima). Se
   il migliore supera una soglia alta e stacca nettamente il secondo →
   risolto senza AI.
4. **AI** (§6), con i candidati del passo 3 nel prompt.
5. Se l'AI non è disponibile, fuori quota o risponde male →
   `resolution = failed`: l'item resta visibile col suo `raw_text` in
   `other` e l'utente può strutturarlo a mano. Un job riprova i `failed`
   recenti quando l'AI torna disponibile.

I passi 1–3 avvengono nella stessa transazione della creazione; il passo 4 è
**asincrono**: la mutazione risponde subito, la risoluzione avviene in una
coda in-process e al termine emette `item.upserted`. Al riavvio del server gli
item `pending` vengono rimessi in coda. Quando la coda contiene più item
pending dello stesso tenant (tipico dopo un flush offline), vengono risolti in
**un'unica chiamata AI**.

Quantità e unità del parser locale vincono su quelle dell'AI; l'AI le
riempie solo se il parser non le ha trovate.

### 5.4 Correzione e apprendimento

L'utente può modificare dall'item:

- quantità, unità, nota → solo l'item;
- prodotto collegato (sceglie un altro prodotto o ne crea uno nuovo) →
  item + alias del suo testo (`source = user_correction`);
- nome o categoria del prodotto → il prodotto, per tutto il tenant.

Ogni creazione/modifica di item aggiorna sul prodotto `last_quantity`,
`last_unit_code`, `use_count`, `last_used_at`.

Concorrenza sugli item: last-write-wins per campo con ora del server. Una lista
della spesa non giustifica la complessità del locking ottimistico; le
modifiche concorrenti sullo stesso campo dello stesso item sono rare e
innocue.

## 6. Integrazione AI

### 6.1 Provider

Astrazione `ItemResolver` con un'unica implementazione basata sul formato
**OpenAI-compatible chat completions**, configurata come **catena di
provider**:

| Ruolo | Provider | Perché |
|---|---|---|
| Primario | **Groq** | limiti free più ampi, latenza molto bassa, modelli open |
| Riserva | **Google Gemini** (famiglia Flash-Lite, endpoint OpenAI-compatible) | ottimo italiano; limiti free più stretti, basta come rete di sicurezza |

Ogni provider ha in env base URL, chiave e modello
(`AI_PRIMARY_BASE_URL`, `AI_PRIMARY_API_KEY`, `AI_PRIMARY_MODEL`, idem
`AI_FALLBACK_*`); se le variabili del primario mancano l'AI è disattivata e
gli item non risolti finiscono `failed`. Cambiare provider o modello non
richiede codice.

Passaggio alla riserva: su errore di rete, timeout, 429 o 5xx del primario,
e su risposta non valida (JSON malformato o che non supera la validazione di
§6.2). Dopo un 429 il primario viene saltato per la durata indicata da
`Retry-After` (o un minuto in sua assenza). Se falliscono entrambi, gli item
restano `failed` e il job di retry li riprova più tardi.

Formato di risposta: solo JSON mode semplice (`response_format: json_object`),
non structured output con schema, perché il supporto varia tra provider e
modelli; la struttura la garantisce la validazione zod.

Note sui free tier, da tenere presenti:

- **Gemini**: i prompt del free tier possono essere usati da Google per
  migliorare i prodotti e letti da revisori umani. Accettato: al provider
  arrivano solo testi di item e nomi di prodotti, nessun dato personale.
- **Groq**: il catalogo dei modelli gratuiti cambia senza preavviso; il
  modello è in env proprio per questo.
- Limiti, policy sui dati e supporto al JSON mode del modello scelto vanno
  verificati nella console di ciascun provider prima dell'implementazione: le
  fonti pubbliche non concordano.

### 6.2 Prompt

- **System**: compito, elenco chiuso dei codici categoria e unità (dalle
  costanti shared), regole ("se un candidato è lo stesso prodotto, usa il suo
  id; non inventare id; nome canonico in italiano, singolare/plurale come in
  uso comune, senza marca salvo sia essenziale; i contenitori — bottiglia,
  confezione, lattina… — si contano in `pc` e restano nel nome solo se
  essenziali a identificare il prodotto").
- **User**: per ogni item da risolvere `{ ref, text, quantity?, unit? }` e i
  suoi candidati `{ id, name, category }`.
- **Output atteso** (per item): `{ ref, productId | null, name,
  categoryCode, quantity | null, unitCode | null }`.

La risposta è validata con zod: `productId` deve appartenere ai candidati
passati per quell'item, i codici devono esistere, le quantità rispettare i
limiti. Qualsiasi violazione → `failed` per quell'item, non per il batch.

### 6.3 Protezioni

- Quota giornaliera per tenant (`MAX_AI_RESOLUTIONS_PER_TENANT_PER_DAY`) e
  timeout breve sulla chiamata.
- Testo inviato limitato a `MAX_NAME_LENGTH`; nessun dato utente oltre al testo
  degli item e ai nomi dei prodotti candidati.
- Log della chiamata (durata, esito, token se forniti) senza il contenuto.

## 7. Sessione di spesa

### 7.1 Claim (solo online)

`shopping.claim({ listIds[] })`. Requisiti: rete, permesso `Shop`
su ciascuna lista. Per ogni lista, in transazione:

1. `SELECT … FOR UPDATE` sulla riga di `lists`;
2. se esiste una sessione attiva → esito `held` con titolare e
   `last_seen_at` (o `own` se è già dello stesso utente: idempotente);
3. altrimenti inserisce la sessione; l'indice unique parziale è l'ultima
   difesa contro le race.

Il risultato è **per lista** (claim parziale ammesso: la UI mostra quali liste
sono occupate e da chi) e include lo **snapshot completo degli item**, così il
dispositivo entra in negozio con i dati più freschi possibili prima di perdere
la rete. Evento `session.started` sulla stanza della lista.

Stesso utente, altro dispositivo: il claim restituisce `own` con la sessione
esistente, che il nuovo dispositivo adotta e continua a usare.

### 7.2 Durante la spesa (anche offline)

- Il client persiste la sessione attiva; la UI di spesa funziona offline.
- Spunta/despunta item: mutazioni accodabili che portano il `sessionId`.
- Heartbeat: ogni contatto col server (mutazione, ping periodico ogni ~2 min
  mentre la sessione è aperta e c'è rete) aggiorna `last_seen_at`.
- Gli altri membri vedono "Marco sta facendo la spesa · visto 3 min fa".
- Chi non ha preso in carico la lista non può spuntare.

Regole di applicazione delle spunte, valutate quando la mutazione arriva al
server:

| Stato della sessione indicata | Spunta | Despunta |
|---|---|---|
| attiva, dell'utente | segna l'item spuntato | toglie la spunta |
| chiusa (qualsiasi motivo), dell'utente | **elimina l'item** | no-op (l'item è già stato eliminato) |
| di un altro utente | rifiutata | rifiutata |

In ogni caso l'utente deve essere ancora membro della lista con `Shop`;
altrimenti la mutazione viene scartata senza errore (il client non può farci
nulla).

La spunta tardiva registra un fatto avvenuto (il prodotto è nel carrello),
quindi non si rifiuta: si applica direttamente l'effetto della chiusura,
cioè l'eliminazione.

**Caso limite accettato**: il titolare offline spunta e poi despunta un item
mentre la sessione viene chiusa. Al ritorno online la spunta elimina l'item e
la despunta è un no-op: l'item è perso e va reinserito (dai suggerimenti è un
tap). Far portare alla despunta uno snapshot per ricreare l'item
resusciterebbe anche item eliminati di proposito da un editor, quindi no.

### 7.3 Fine della sessione

Una sola operazione per il titolare: `shopping.end({ sessionId })`
("Termina spesa"), chiusura con `completed`. Non esiste un rilascio distinto
dal completamento: chi vuole abbandonare la spesa senza comprare toglie prima
le spunte.

**Qualsiasi chiusura** — `completed`, `expired`, `interrupted`, `revoked` —
nella stessa transazione:

1. chiude la sessione (`ended_at`, `end_reason`, `ended_by`);
2. elimina **tutti** gli item spuntati della lista (al più quelli della
   sessione stessa, per l'invariante di §4.3);
3. emette `session.ended` e `item.deleted` per gli item eliminati.

Gli item non spuntati restano nella lista per la prossima volta.

`shopping.end` è accodabile offline e idempotente: se la sessione è già
chiusa è un no-op (non errore). Il client, terminando offline, esce subito
dalla modalità spesa; la lista resta però occupata agli occhi degli altri
finché la coda non arriva al server o la sessione non scade — inevitabile, ed
è per questo che esistono scadenza e interruzione.

### 7.4 Scadenza, interruzione, revoca

Non esiste il subentro: nessuno può prendere una lista occupata. La lista si
libera solo quando la sessione si chiude (fine, scadenza, interruzione,
revoca); dopo, chiunque abbia `Shop` può fare un claim normale. Ogni chiusura
ha gli effetti di §7.3.

- **Scadenza**: il job chiude con `expired` le sessioni con `last_seen_at`
  più vecchio di `SHOPPING_SESSION_IDLE_HOURS` (proposta: 4 h). Deve essere
  lungo: un supermercato senza campo è il caso normale, non l'eccezione.
- **Interruzione**: un membro con `Manage` sulla lista può terminare la
  sessione in corso (`shopping.interrupt`, solo online, con conferma). La
  sessione si chiude con `interrupted` + `ended_by`; il titolare riceve
  evento e push. Se il titolare è offline e continua a fare la spesa, le sue
  spunte arrivate dopo l'interruzione eliminano gli item (§7.2):
  l'interruzione libera la lista, non annulla gli acquisti.
- **Revoca**: togliere `Shop` a un membro, o rimuoverlo, chiude le sue
  sessioni con `revoked`. Cancellare la lista le elimina in cascata.

### 7.5 Riconciliazione al ritorno online

Al riconnettersi il client:

1. svuota la coda delle mutazioni (spunte, fine sessione) — vengono applicate
   secondo §7.2/§7.3;
2. chiede lo stato delle proprie sessioni; se una risulta chiusa
   (`expired`/`interrupted`/`revoked`) mostra un avviso non bloccante ("Anna
   ha interrotto la spesa alle 18:40") ed esce dalla modalità spesa per
   quella lista;
3. riscarica gli item della lista: quelli eliminati dalla chiusura spariscono.

La chiusura della sessione (§7.3) è il punto in cui in futuro il "ponte"
verso la dispensa potrà leggere gli item spuntati prima di eliminarli.

## 8. API ed eventi

### 8.1 tRPC

| Procedura | Perm. | Offline | Note |
|---|---|---|---|
| `catalog.lookups` | auth | cache | categorie e unità (codici + attributi) |
| `catalog.products.sync({ since? })` | auth | cache | prodotti + alias del tenant, incrementale |
| `catalog.products.update` | Write su una lista | coda | nome/categoria del prodotto |
| `items.list({ listId })` | Read | cache | |
| `items.create({ id, listId, rawText, productId?, quantity?, unitCode?, note? })` | Write | coda | anche batch per l'incolla multiplo |
| `items.update(...)` | Write | coda | campi item + eventuale ricollegamento prodotto |
| `items.delete` | Write | coda | |
| `items.check` / `items.uncheck({ itemId, sessionId })` | Shop + sessione | coda | su sessione chiusa: vedi §7.2 |
| `shopping.claim({ listIds })` | Shop | **no** | |
| `shopping.interrupt({ sessionId })` | Manage | **no** | termina la sessione di un altro |
| `shopping.heartbeat({ sessionIds })` | Shop | — | best effort |
| `shopping.end({ sessionId })` | titolare | coda | idempotente; elimina gli spuntati |
| `shopping.mine` | auth | — | stato delle proprie sessioni |

Tutte le mutazioni portano `mutationId` (dedup esistente) e `tenantId` è
sempre ricavato dalla sessione utente, mai opzionale.

### 8.2 Eventi realtime

- `item.upserted` / `item.deleted` (esistenti) — anche a fine risoluzione AI.
- `session.started { listId, session }`,
  `session.ended { listId, sessionId, reason, endedBy }` (già abbozzati in
  `events.ts`).
- **Nuovo** `product.upserted { productId }` su una **stanza di tenant**
  (`tenant:<id>`, da aggiungere), per tenere allineato il catalogo locale.

## 9. Permessi

| Azione | Permesso |
|---|---|
| Vedere item e chi sta facendo la spesa | `Read` |
| Aggiungere/modificare/eliminare item, correggere prodotti | `Write` |
| Claim, spunta, fine sessione | `Shop` |
| Interrompere la sessione di spesa di un altro | `Manage` |

Aggiungere item richiede sempre `Write` (ruoli `Editor` e `Owner`), anche
mentre c'è una sessione di spesa in corso: la sessione non blocca le
modifiche alla lista, e gli item aggiunti arrivano all'acquirente via
realtime (o al ritorno online). Uno `Shopper` (Read + Shop) non può
aggiungere item, nemmeno durante la propria spesa.

## 10. Fasi di implementazione

1. **Lookup**: costanti shared, tabelle + seed, traduzioni, `catalog.lookups`.
2. **Prodotti e item senza AI**: tabelle, normalizzazione, parser locale,
   pipeline passi 1–3 (`failed` al posto dell'AI), CRUD item offline,
   modifica/correzione con alias.
3. **Suggerimenti**: sync catalogo sul client, matcher locale, UI di
   inserimento.
4. **AI**: `ItemResolver` con catena Groq → Gemini, coda asincrona, batch,
   quote, retry dei `failed`.
5. **Sessione di spesa**: tabella, claim/heartbeat/end,
   scadenza, interruzione, revoca, UI spesa offline, riconciliazione.

Le fasi 2–3 consegnano già un inserimento rapido usabile; l'AI (4) migliora
solo i testi mai visti.

## 11. Decisioni aperte

Nessuna.

Decise:

- **Provider AI**: Groq come primario, Gemini come riserva, entrambi via
  endpoint OpenAI-compatible e configurati in env (§6.1).
- **Fine spesa**: niente archivio. Qualsiasi chiusura di sessione elimina gli
  item spuntati; una spunta arrivata su una sessione già chiusa elimina
  l'item. Rilascio e completamento sono un'unica operazione
  (`shopping.end`). Durante la spesa si vedono anche gli spuntati (§4.3,
  §7.2, §7.3).
- **Aggiunta di item**: solo con `Write` (`Editor`, `Owner`), anche durante
  una sessione in corso. Uno `Shopper` non può aggiungere item (§9).
- **Subentro**: non esiste. Un `Manage` può solo interrompere la sessione in
  corso; le spunte del titolare arrivate dopo vengono accettate (§7.4).
- **Ordine delle categorie per negozio**: non si implementa. Vale per tutti
  il `sort_order` seedato.
- **Ambito del catalogo prodotti**: per tenant. Prodotti e alias sono
  condivisi da tutte le liste e da tutti gli utenti dello stesso tenant.
