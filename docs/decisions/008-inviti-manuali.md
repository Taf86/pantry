# 008 — Onboarding a inviti, senza email

**Stato**: accettata · **Data**: agosto 2026 · **Superata in parte da**:
[013](013-richieste-di-registrazione.md), che riapre l'ingresso come richiesta
da approvare. Il flusso di invito descritto qui resta invariato: è ciò che
l'approvazione riusa.

## Contesto

L'invio di email è fuori scope in v1: significherebbe un servizio in più, un
dominio da autenticare (SPF, DKIM, DMARC) e una superficie di consegna da
sorvegliare, per una manciata di utenti.

## Decisione

Nessuna auto-registrazione. L'amministratore crea l'account dal backoffice,
il sistema genera un token casuale di 32 byte e mostra **una sola volta**
l'URL completo. La consegna avviene fuori banda.

Reset password: non self-service. L'admin rigenera un invito.

## Motivo

Con una manciata di utenti la consegna a mano è accettabile, e il modello a
token è **già quello giusto per migrare**: quando arriveranno le email basterà
spedire automaticamente lo stesso link invece di mostrarlo.

## Conseguenze

- In database finisce solo lo **SHA-256** del token, mai il token. Un dump del
  database non consegna i link ancora validi. Non serve un KDF lento: 256 bit
  di entropia non sono attaccabili per forza bruta come una password.
- Il consumo dell'invito è un `UPDATE ... WHERE used_at IS NULL RETURNING`:
  due tentativi concorrenti sullo stesso link non possono riuscire entrambi.
- L'accettazione — invito bruciato, password scritta, stato portato ad
  `active` — sta in **una sola transazione**. Da Better Auth si prende in
  prestito solo la funzione di hashing, che è pura: un invito consumato senza
  password scritta lascerebbe l'utente fuori senza modo di rientrare.
- Rigenerare un invito brucia i precedenti ancora aperti: solo l'ultimo link
  consegnato funziona.
- `users.status` resta a tre valori — `'unactivated'`, `'active'`, `'suspended'` —
  e le auto-registrazioni da approvare non ne hanno aggiunto un quarto: vivono in
  `signup_requests`, tabella propria (ADR 013).
- Accettare un invito non riattiva un account sospeso: il predicato sullo stato
  sta nella `WHERE` dell'`UPDATE` che porta ad `active`, così un link ancora
  valido non scavalca la decisione dell'amministratore.
