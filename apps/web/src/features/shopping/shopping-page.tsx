import { useQuery, useQueryClient } from "@tanstack/react-query";
import { groupByCategory, sessionProgress, toEntries } from "pantry-shared";
import { useMemo, useState } from "react";

import { Button, Card, Empty, ErrorState, Loading } from "../../components/ui";
import { useSyncStatus } from "../../hooks/use-network";
import { keys } from "../../lib/keys";
import { notify } from "../../lib/notify";
import { errorMessage, trpc } from "../../lib/trpc";
import { useRooms } from "../../hooks/use-rooms";
import { ItemRow } from "../lists/item-row";
import { ToPantryDialog } from "./to-pantry-dialog";

/**
 * Modalità spesa: la vista fusa di tutte le liste su cui si ha `Shop`.
 *
 * La fusione è lato client. Il server non sa che esiste una "sessione di
 * spesa" e ogni spunta resta indirizzata alla sua lista: è ciò che permette
 * di mostrare due righe distinte se il latte è in due liste, senza dover
 * decidere al posto dell'utente quale delle due aggiornare.
 */
export const ShoppingPage = () => {
  const client = useQueryClient();
  const [handOver, setHandOver] = useState(false);
  const sync = useSyncStatus();

  const session = useQuery({
    queryKey: keys.shoppingSession(),
    queryFn: () => trpc.shopping.session.query({}),
    // Una sessione di spesa dura un'ora, non trenta secondi: rinfrescarla di
    // continuo mentre si è in negozio non serve a niente.
    staleTime: 60_000,
  });

  const listIds = useMemo(
    () => (session.data?.lists ?? []).map((entry) => entry.listId),
    [session.data],
  );
  useRooms({ lists: listIds });

  const groups = useMemo(() => {
    if (!session.data) return [];
    return groupByCategory(
      toEntries(session.data.lists),
      session.data.categories,
    );
  }, [session.data]);

  const progress = useMemo(
    () =>
      session.data ? sessionProgress(session.data) : { total: 0, checked: 0 },
    [session.data],
  );

  const preload = async (): Promise<void> => {
    await client.refetchQueries({ queryKey: keys.shoppingSession() });
    notify(
      "success",
      "Liste scaricate: da qui in poi funziona anche senza rete.",
    );
  };

  if (session.isPending) return <Loading what="della sessione di spesa" />;
  if (session.isError) {
    return (
      <ErrorState
        message={errorMessage(session.error)}
        onRetry={() => void session.refetch()}
      />
    );
  }

  const hasCheckedItems = progress.checked > 0;

  return (
    <>
      <div className="page-header">
        <h1>Spesa</h1>
        <div className="page-header__actions">
          <Button
            size="small"
            onClick={() => void preload()}
            disabled={sync.state === "offline"}
          >
            Precarica
          </Button>
          {hasCheckedItems && (
            <Button
              size="small"
              variant="primary"
              onClick={() => setHandOver(true)}
            >
              In dispensa
            </Button>
          )}
        </div>
      </div>

      <p className="muted">
        {progress.total === 0
          ? "Nessun prodotto da comprare."
          : `${progress.checked} di ${progress.total} nel carrello · ${listIds.length} ${listIds.length === 1 ? "lista" : "liste"}`}
      </p>

      {groups.length === 0 && (
        <Card>
          <Empty>
            Niente da comprare. Le liste su cui puoi fare la spesa compaiono
            qui, unite e ordinate per corsia.
          </Empty>
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.categoryId ?? "none"} className="stack">
          <p className="group-heading">{group.categoryName}</p>
          <ul className="list-rows">
            {group.entries.map((entry) => (
              <li key={`${entry.listId}:${entry.item.id}`}>
                <ItemRow
                  item={entry.item}
                  canWrite={false}
                  canShop
                  listLabel={listIds.length > 1 ? entry.listName : undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {handOver && session.data && (
        <ToPantryDialog
          session={session.data}
          onClose={() => setHandOver(false)}
        />
      )}
    </>
  );
};
