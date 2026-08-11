# 003 — TypeScript su client e server

**Stato**: accettata · **Data**: agosto 2026

## Contesto

La risorsa scarsa del progetto è il tempo dello sviluppatore, non la CPU.
Alternative valutate: Kotlin/Spring, Rust.

## Decisione

TypeScript ovunque, monorepo pnpm con tre workspace: `apps/api`, `apps/web`,
`packages/shared`.

## Motivo

La ragione non è estetica né di preferenza personale. I flag di permesso, la
struttura ad albero della dispensa e la forma degli item **esistono su client
e server**, e definirli due volte è la fonte di bug più prevedibile del
progetto: due implementazioni della stessa regola divergono, e divergono in
silenzio.

`packages/shared` contiene esattamente ciò che deve valere identico da
entrambe le parti — schemi Zod, bitmask dei permessi, risoluzione dei
conflitti, ordinamento della spesa — e nient'altro.

## Conseguenze

- Un solo linguaggio da tenere aggiornato, un solo tooling.
- `packages/shared` si compila in ESM e CJS: il server lo importa come modulo
  nativo, il bundler del client lo tratta come sorgente.
- Il tipo del router tRPC attraversa il confine senza codegen: `apps/web`
  dipende da `pantry-api` solo per i tipi, che spariscono in compilazione.
