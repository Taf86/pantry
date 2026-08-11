# 011 — Date come stringhe ISO sul filo, senza trasformatore

**Stato**: accettata · **Data**: agosto 2026

## Contesto

tRPC serializza in JSON, che non ha un tipo data. La soluzione consueta è
`superjson`, che ricostruisce gli oggetti `Date` da entrambe le parti.

## Decisione

I DTO espongono le date come **stringhe ISO 8601**. La conversione avviene una
volta sola, nei mapper del server (`services/mappers.ts`). Nessun
trasformatore sul filo.

## Motivo

Due ragioni, la seconda più importante della prima.

1. Senza trasformatore, un `Date` diventerebbe comunque una stringa durante la
   serializzazione mentre il tipo continuerebbe a dire `Date`: una bugia che il
   client scopre solo a runtime.
2. **La cache di TanStack Query viene persistita su IndexedDB.** Al riavvio
   dell'app la si rilegge da `JSON.parse`, e un `Date` tornerebbe stringa
   comunque. Con le stringhe ISO ovunque, il valore in cache e il valore
   appena arrivato dalla rete sono lo stesso tipo — sempre.

Le date pure (le scadenze) restano `YYYY-MM-DD` senza fuso orario: una
scadenza è un giorno, non un istante, e trasformarla in un `Date` significa
regalarle un fuso orario che non ha.

## Conseguenze

- I confronti temporali usano `Date.parse`, che sulle stringhe ISO è esatto.
- L'ordinamento lessicografico delle stringhe ISO coincide con quello
  cronologico, il che rende gratis diversi ordinamenti.
- Un payload leggermente più grande di quanto sarebbe con un formato binario.
  Irrilevante a questa scala.
