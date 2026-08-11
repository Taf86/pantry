# 009 — Adjacency list invece di closure table o `ltree`

**Stato**: accettata · **Data**: agosto 2026

## Contesto

La dispensa è un albero a profondità arbitraria: armadio → scaffale → cassetto
→ biscotti. Le alternative classiche sono closure table, path enumeration e
`ltree`.

## Decisione

Adjacency list: `pantry_nodes.parent_id` che punta alla stessa tabella. Le
interrogazioni sull'albero usano CTE ricorsive.

## Motivo

Una dispensa ha **decine di nodi, non milioni**. La CTE ricorsiva è più che
sufficiente, e in cambio lo schema resta leggibile: una riga, un genitore.
Una closure table aggiungerebbe una tabella da mantenere in sincronia a ogni
spostamento — cioè esattamente l'operazione più delicata.

## Conseguenze

- Lo spostamento richiede un controllo esplicito dei cicli, nella **stessa
  transazione** dello spostamento: due riparentamenti concorrenti potrebbero
  altrimenti passare entrambi il controllo e creare comunque un ciclo.
- Cancellare un contenitore cancella il sottoalbero (tombstone su tutti i
  discendenti). Lasciare i figli vivi ma irraggiungibili sarebbe peggio di
  entrambe le alternative.
- La stessa invariante è implementata anche in `packages/shared`
  (`wouldCycle`), lato client: non per fidarsene, ma per non proporre nemmeno
  un'operazione che il server rifiuterà.
