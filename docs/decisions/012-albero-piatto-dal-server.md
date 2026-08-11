# 012 — L'albero della dispensa viaggia piatto

**Stato**: accettata · **Data**: agosto 2026

## Contesto

`nodes.tree` potrebbe restituire l'albero già annidato, che è la forma che la
UI consuma.

## Decisione

Il server restituisce l'**elenco piatto** dei nodi. Il client lo materializza
con `buildTree`, che vive in `packages/shared`.

## Motivo

Gli eventi real-time notificano **singoli nodi** (`pantry.node.upserted`), non
alberi. Il client deve quindi saper ricostruire la struttura comunque, per
applicare un aggiornamento arrivato dal socket senza rifare la query.

Se anche il server annidasse, ci sarebbero due implementazioni della stessa
struttura da tenere d'accordo — esattamente la duplicazione che
`packages/shared` esiste per evitare.

La forma piatta è anche quella giusta per la cache: aggiornare un nodo è una
sostituzione per `id`, non una visita ricorsiva.

## Conseguenze

- `buildTree` è puro e testato in `packages/shared`.
- I nodi il cui genitore non è nell'insieme diventano radici: la vista resta
  utilizzabile anche con una copia parziale, che è la norma offline.
- Le CTE ricorsive restano dove servono davvero, cioè lato server: controllo
  dei cicli sullo spostamento e cancellazione del sottoalbero.
