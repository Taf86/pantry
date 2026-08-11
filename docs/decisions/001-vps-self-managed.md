# 001 — VPS self-managed invece di piattaforma serverless

**Stato**: accettata · **Data**: agosto 2026

## Contesto

L'applicazione deve costare intorno ai 5 €/mese e la sviluppa una persona sola,
part-time. L'alternativa naturale è Cloudflare Workers + D1 + Durable Objects,
che a questa scala sarebbe gratuita o quasi.

## Decisione

Una VPS Hetzner CX22 con Docker Compose: Caddy, Fastify, Postgres.

## Motivo

I confini dei Durable Object tagliano trasversalmente rispetto alle
funzionalità. Tre indizi nella stessa direzione:

- la **spesa multi-lista** legge da N liste contemporaneamente, e ogni lista
  sarebbe un DO diverso;
- il **ponte lista ↔ dispensa** scrive su due aggregati nella stessa
  operazione, che in un modello a DO significa coordinamento distribuito per
  una funzionalità che qui è una singola transazione;
- qualunque **reportistica** futura è una query trasversale.

Ognuno di questi, da solo, si aggirerebbe. Tutti e tre insieme dicono che il
modello a partizioni è quello sbagliato per questo dominio.

## Conseguenze

- Manutenzione: patch di sistema e verifica dei backup, circa un'ora al mese.
- Un solo processo: niente stato condiviso da coordinare, niente Redis.
- Backup e restore sono responsabilità nostra (vedi §13 della specifica).
- Un PaaS costerebbe 20-25 $/mese: la differenza è tempo contro denaro, ed è
  stata scelta consapevolmente.
