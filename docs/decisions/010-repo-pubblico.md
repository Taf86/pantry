# 010 — Repository pubblico dal primo commit

**Stato**: accettata · **Data**: agosto 2026

## Contesto

L'alternativa è tenerlo privato e aprirlo più avanti, "quando sarà
presentabile".

## Decisione

Pubblico dal primo commit.

## Motivo

- Nessuna **storia pregressa da bonificare**: un repository che nasce pubblico
  non ha mai avuto l'occasione di contenere un segreto, mentre uno aperto in
  seguito richiede di riscrivere la storia e sperare di non aver dimenticato
  nulla.
- Minuti Actions illimitati e nessun tetto sullo storage GHCR.
- La disciplina sui segreti è forzata dal primo giorno, invece di essere
  rimandata.

## Conseguenze

- Nel repository vive solo `.env.example`, con chiavi e valori fittizi.
- Push protection di GitHub attiva; `gitleaks` come pre-commit hook.
- `DATABASE_URL` **non** è una variabile d'ambiente: si compone nel codice da
  `POSTGRES_PASSWORD`. Se la password vivesse in due posti, la rotazione ne
  dimenticherebbe uno.
- I segreti stanno in tre posti e in nessun altro: password manager,
  `/opt/pantry/.env` (chmod 600, scritto a mano), GitHub Actions Secrets (solo
  `SSH_HOST` e `SSH_KEY`).
