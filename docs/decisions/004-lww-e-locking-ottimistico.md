# 004 — LWW e locking ottimistico invece di CRDT

**Stato**: accettata · **Data**: agosto 2026

## Contesto

L'app deve funzionare offline al supermercato e sincronizzarsi al ritorno.
La soluzione "completa" sarebbe un sync engine (ElectricSQL, PowerSync, Zero)
o dei CRDT.

## Decisione

Politiche esplicite per tipo di operazione, scritte a mano:

| Operazione            | Politica                              |
| --------------------- | ------------------------------------- |
| Spunta / de-spunta    | LWW su `checked_at`                   |
| Aggiunta item         | Insert idempotente su PK client       |
| Modifica contenuto    | Locking ottimistico su `version`      |
| Cancellazione         | Tombstone (`deleted_at`)              |
| Spostamento nodo      | Transazione + controllo cicli         |
| Consumo da dispensa   | `UPDATE ... quantity = quantity - $1` |

## Motivo

Il modello di conflitto di questa applicazione è **benigno ma non banale**:
due persone che spuntano lo stesso prodotto producono lo stesso risultato,
mentre due persone che ne correggono la quantità hanno un lost update reale.
Le due situazioni vogliono due risposte diverse, e un CRDT le tratterebbe
allo stesso modo.

Il codice necessario è nell'ordine delle 200 righe, ed è codice
**debuggabile**. Un sync engine che si comporta in modo strano alle undici di
sera è un problema molto peggiore di 200 righe che hai scritto tu.

## Conseguenze

- `version` va incrementata solo dalle modifiche di contenuto. La spunta non
  la tocca: altrimenti chi fa la spesa invaliderebbe di continuo le modifiche
  di chi è a casa.
- Il riferimento del LWW è `COALESCE(checked_at, updated_at)`. Il compromesso
  è che anche una modifica di contenuto sposta il riferimento, e può quindi
  sopprimere una spunta offline più vecchia. È il prezzo di non aggiungere una
  colonna: raro, e il risultato è un prodotto non spuntato, non un dato
  corrotto.
- Sul conflitto il client **accetta lo stato del server** e mostra una
  notifica non bloccante. Nessun dialogo di merge: sarebbe sproporzionato per
  un'app della spesa, e nessuno lo leggerebbe in mezzo alla corsia.
- La stessa regola vive in `packages/shared` (`resolveCheck`) e nella query
  SQL, così client e server decidono allo stesso modo.
