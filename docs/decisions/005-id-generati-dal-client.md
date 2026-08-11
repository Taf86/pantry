# 005 — ID generati dal client

**Stato**: accettata · **Data**: agosto 2026

## Contesto

L'alternativa consueta è che il server generi le chiavi primarie e il client
riconcili gli ID temporanei quando arriva la risposta.

## Decisione

Ogni entità di dominio — liste, item, dispense, nodi — nasce con un **UUID v7
generato nel browser**, prima ancora della chiamata di rete. Gli ID degli
utenti restano a Better Auth, perché nascono solo dal backoffice e non hanno
il problema.

## Motivo

È il prerequisito dell'offline: l'item deve avere identità mentre sei ancora
tra gli scaffali senza segnale. Da lì discendono due proprietà gratuite:

- l'INSERT è **idempotente** (`ON CONFLICT DO NOTHING`): la coda offline può
  ritentare quante volte vuole;
- l'aggiornamento ottimistico non ha nulla da riconciliare al ritorno del
  server, perché l'ID è già quello definitivo.

UUID v7 e non v4: la componente temporale iniziale li rende ordinabili, il che
mantiene sano l'indice B-tree della primary key invece di frammentarlo.

## Conseguenze

- Il generatore è monotòno anche dentro lo stesso millisecondo, altrimenti
  aggiungere cinque prodotti di fila produrrebbe un ordine casuale.
- Anche le operazioni che creano più righe (`pantry.toList`,
  `shopping.toPantry`) ricevono gli ID di destinazione dal client, per la
  stessa ragione.
- Un client malevolo può scegliere i propri ID. Non è un problema: gli ID non
  sono capacità, e ogni scrittura passa comunque dal controllo di membership.
