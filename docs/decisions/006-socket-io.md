# 006 — Socket.IO invece di `ws` nudo o tRPC subscriptions

**Stato**: accettata · **Data**: agosto 2026

## Contesto

Servono aggiornamenti push server→client quando due persone guardano la stessa
lista. `ws` nudo è più leggero; le subscription tRPC unificherebbero il
trasporto con il resto dell'API.

## Decisione

Socket.IO, un namespace, una room per lista (`list:<id>`) e una per dispensa
(`pantry:<id>`). Il socket trasporta **solo notifiche**, mai mutazioni.

## Motivo

Una cosa sola: la **riconnessione con backoff su rete mobile instabile**,
gestita bene. È letteralmente lo scenario del supermercato — si entra in un
tunnel, si perde il segnale fra gli scaffali, si riprende alla cassa.
Riscriverla su `ws` significherebbe riscrivere male ciò che Socket.IO fa già.

I due canali sono una scelta deliberata: tRPC su HTTP dà tipi e validazione
sul percorso critico (query e mutazioni), Socket.IO dà robustezza sul percorso
di notifica. Le subscription tRPC unificherebbero, ma sono meno mature e
perderebbero il backoff.

## Conseguenze

- L'autenticazione del socket è il cookie di sessione sull'handshake, che
  funziona **solo** perché frontend e API stanno sulla stessa origin: il
  browser non permette header custom sull'handshake WebSocket.
- L'ingresso in una room verifica la membership come qualunque altra lettura.
- Il client rifà il `join` a ogni riconnessione: il server non ricorda le room
  di un socket caduto.
- Un evento malformato viene ignorato invece di corrompere la cache: al
  refetch successivo la verità torna comunque dal server.
