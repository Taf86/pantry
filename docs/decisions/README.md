# Decisioni architetturali

Ogni file documenta una scelta e — soprattutto — le alternative scartate con
il motivo. Il formato è volutamente breve: contesto, decisione, conseguenze.

Una ADR non si modifica quando la realtà cambia: si scrive quella successiva
che la supera, e si marca la vecchia come sostituita. La storia delle scelte
vale quanto le scelte.

| #                                             | Decisione                        | Stato    |
| --------------------------------------------- | -------------------------------- | -------- |
| [001](001-vps-self-managed.md)                | VPS self-managed                 | Accettata |
| [002](002-postgresql.md)                      | PostgreSQL                       | Accettata |
| [003](003-typescript-ovunque.md)              | TypeScript ovunque               | Accettata |
| [004](004-lww-e-locking-ottimistico.md)       | LWW + locking ottimistico        | Accettata |
| [005](005-id-generati-dal-client.md)          | ID generati dal client           | Accettata |
| [006](006-socket-io.md)                       | Socket.IO                        | Accettata |
| [007](007-backoffice-nella-stessa-spa.md)     | Backoffice nella stessa SPA      | Accettata |
| [008](008-inviti-manuali.md)                  | Inviti manuali senza email       | Accettata, superata in parte da 013 |
| [009](009-adjacency-list.md)                  | Adjacency list per l'albero      | Accettata |
| [010](010-repo-pubblico.md)                   | Repo pubblico dal primo commit   | Accettata |
| [011](011-date-iso-sul-filo.md)               | Date ISO sul filo, senza superjson | Accettata |
| [012](012-albero-piatto-dal-server.md)        | Albero della dispensa piatto sul filo | Accettata |
| [013](013-richieste-di-registrazione.md)      | Richieste di registrazione con approvazione | Accettata |
