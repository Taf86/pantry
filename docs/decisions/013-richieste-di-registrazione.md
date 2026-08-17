# 013 — Richieste di registrazione con approvazione

**Stato**: accettata · **Data**: agosto 2026 · **Supera in parte**:
[008](008-inviti-manuali.md)

## Contesto

[008](008-inviti-manuali.md) ha chiuso l'auto-registrazione perché senza email
non c'era modo di verificare chi si registrava. Resta però un attrito reale:
chi vuole un account deve prima riuscire a contattare un amministratore per
altre vie, e l'amministratore deve fidarsi di aver capito bene nome e indirizzo.

Le email continuano a non esserci. La decisione da prendere non è quindi "come
si registra un utente", ma **dove vive una richiesta non ancora approvata**.

## Decisione

Una tabella `signup_requests`, separata da `users`. Il modulo pubblico
raccoglie email, nome e **un contatto**; l'approvazione dal backoffice crea
l'utente e genera il consueto link di invito, che l'amministratore consegna
fuori banda al contatto indicato.

L'alternativa scartata era un quarto valore `'pending'` in `users.status`, con
la password scelta subito in fase di richiesta.

## Motivo

Una richiesta non è un account a metà: non ha credenziali, non ha sessioni, e
soprattutto **non deve occupare un'email** finché qualcuno non l'ha accettata.
Con `users.status = 'pending'` un rifiuto lascia una riga in `users` che tiene
prenotato l'indirizzo per sempre, oppure obbliga a cancellare utenti — e
cancellare utenti è un'operazione che nessuna parte del sistema dovrebbe dover
fare per un flusso ordinario.

Il secondo motivo è la superficie pubblica. La variante con password avrebbe
messo un **hash di password su una rotta anonima**: scrypt regalato a chiunque
sappia fare una POST, cioè amplificazione di CPU. Qui la rotta pubblica fa un
solo `INSERT`.

Il terzo è che l'approvazione **è già scritta**: `createUserTx` più
`issueInvite` sono esattamente il flusso di 008, e la modale che mostra il link
non sa nemmeno da dove sia arrivata la creazione.

Il prezzo è dichiarato: chi fa richiesta non ha nulla da controllare e non può
tentare il login, perché il suo account non esiste ancora. È il motivo per cui
il contatto è obbligatorio — senza email da spedire, è l'unico canale di
consegna del link.

## Conseguenze

- `users.status` resta a tre valori. La riga finale di
  [008](008-inviti-manuali.md) diceva che `'pending'` era già ammesso dal
  `CHECK`: **non era vero**, e ora non serve più che lo diventi.
- Una sola richiesta aperta per indirizzo, garantita da un **indice unique
  parziale** su `email WHERE status = 'pending'`. È un'invariante del database e
  non un select-poi-insert: due invii simultanei non possono riuscire entrambi.
  Essendo parziale lascia ri-candidarsi dopo un rifiuto.
- La risposta del modulo pubblico è **identica** in ogni caso — indirizzo
  libero, già utente, già in coda. Un esito differenziato trasformerebbe la
  rotta in un oracolo su quali email esistono, che è la stessa ragione per cui
  il login non dice quale dei due campi è sbagliato.
- L'approvazione **decide prima e crea dopo**, in una sola transazione:
  `UPDATE ... WHERE status = 'pending' RETURNING` rende impossibile che due
  approvazioni concorrenti producano due utenti, e un fallimento della creazione
  rimette la richiesta in coda invece di consumarla a vuoto.
- Il ruolo non viene dalla richiesta: si nasce `user`. Un modulo pubblico non
  decide privilegi.
- La porta è chiusa per default (`SIGNUP_ENABLED`), con un codice condiviso
  opzionale (`SIGNUP_CODE`) e un tetto alle richieste aperte. Il codice non è un
  segreto crittografico: è il filtro che azzera le richieste automatiche, che
  nessun rate limit ferma del tutto.
- Il rifiuto non cancella niente: la riga resta come traccia, e il job di
  pulizia periodica spazza le richieste evase dopo un mese.
- Il reset password resta fuori: 008 continua a valere, l'admin rigenera un
  invito. Far passare anche quello da questa coda era possibile a costo di un
  `if`, ed è stato scartato per non far significare due cose diverse alla stessa
  tabella.
