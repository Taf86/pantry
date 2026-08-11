# 007 — Backoffice nella stessa SPA

**Stato**: accettata · **Data**: agosto 2026

## Contesto

Serve un'interfaccia amministrativa per creare utenti e generare inviti.

## Decisione

Una rotta `/admin` nella stessa SPA, protetta da route guard lato client e da
`adminProcedure` lato server.

## Motivo

Una seconda applicazione significherebbe un secondo build, un secondo deploy e
un secondo sistema di autenticazione, in cambio di nulla: gli utenti sono gli
stessi, le sessioni sono le stesse, e il backoffice ha tre schermate.

## Conseguenze

- **La protezione vera è `adminProcedure`.** Nascondere la voce di menu non è
  autorizzazione: ogni procedura `admin.*` verifica `role === 'admin'` lato
  server, e la guardia lato client serve solo a non mostrare una schermata che
  darebbe errori a ogni chiamata.
- Il bundle contiene il codice del backoffice anche per gli utenti normali.
  A questa dimensione è irrilevante; se un giorno smettesse di esserlo,
  basterebbe un `lazy()` sulla rotta.
