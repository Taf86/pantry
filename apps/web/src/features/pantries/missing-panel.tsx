import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_EXPIRING_WITHIN_DAYS,
  daysUntil,
  type PantryAlert,
  type ToListInput,
} from "pantry-shared";
import { useState } from "react";

import { Badge, Button, Card, Field, Modal } from "../../components/ui";
import { useAppMutation } from "../../hooks/use-app-mutation";
import { formatDays } from "../../lib/format";
import { newId, newMutationId } from "../../lib/ids";
import { keys } from "../../lib/keys";
import { MUTATION } from "../../lib/mutations";
import { notify } from "../../lib/notify";
import { trpc } from "../../lib/trpc";

/**
 * Il ponte nell'altra direzione: la dispensa sa cosa manca, e lo passa alla
 * lista. È qui che le due metà dell'app cominciano a parlarsi.
 */
export const MissingPanel = ({
  pantryId,
  canWrite,
}: {
  pantryId: string;
  canWrite: boolean;
}) => {
  const [transferring, setTransferring] = useState(false);

  const missing = useQuery({
    queryKey: keys.pantryMissing(pantryId),
    queryFn: () => trpc.pantries.missing.query({ pantryId }),
  });

  const expiring = useQuery({
    queryKey: keys.pantryExpiring(pantryId, DEFAULT_EXPIRING_WITHIN_DAYS),
    queryFn: () =>
      trpc.pantries.expiring.query({
        pantryId,
        withinDays: DEFAULT_EXPIRING_WITHIN_DAYS,
      }),
  });

  const missingItems = missing.data ?? [];
  const expiringItems = expiring.data ?? [];

  if (missingItems.length === 0 && expiringItems.length === 0) return null;

  return (
    <>
      <Card className="stack" style={{ padding: "0.85rem" }}>
        {missingItems.length > 0 && (
          <div className="stack stack--tight">
            <div className="row">
              <strong style={{ flex: 1 }}>
                Sotto soglia ({missingItems.length})
              </strong>
              {canWrite && (
                <Button size="small" onClick={() => setTransferring(true)}>
                  Aggiungi a una lista
                </Button>
              )}
            </div>
            <AlertList alerts={missingItems} />
          </div>
        )}

        {expiringItems.length > 0 && (
          <div className="stack stack--tight">
            <strong>In scadenza ({expiringItems.length})</strong>
            <AlertList alerts={expiringItems} showExpiry />
          </div>
        )}
      </Card>

      {transferring && (
        <ToListModal
          pantryId={pantryId}
          alerts={missingItems}
          onClose={() => setTransferring(false)}
        />
      )}
    </>
  );
};

const AlertList = ({
  alerts,
  showExpiry = false,
}: {
  alerts: PantryAlert[];
  showExpiry?: boolean;
}) => (
  <ul className="list-rows">
    {alerts.map((alert) => (
      <li key={alert.node.id} className="item-row">
        <div className="item-row__body">
          <span className="item-row__name">{alert.node.name}</span>
          <div className="item-row__meta">
            {alert.path.length > 0 && <span>{alert.path.join(" › ")}</span>}
            {showExpiry && alert.node.expiresAt !== null && (
              <Badge
                tone={
                  daysUntil(alert.node.expiresAt) < 0 ? "danger" : "warning"
                }
              >
                {daysUntil(alert.node.expiresAt) < 0
                  ? "scaduto"
                  : `scade ${formatDays(daysUntil(alert.node.expiresAt))}`}
              </Badge>
            )}
          </div>
        </div>
      </li>
    ))}
  </ul>
);

const ToListModal = ({
  pantryId,
  alerts,
  onClose,
}: {
  pantryId: string;
  alerts: PantryAlert[];
  onClose: () => void;
}) => {
  const [listId, setListId] = useState("");
  const toList = useAppMutation<
    ToListInput,
    { created: unknown[]; skipped: string[] }
  >(MUTATION.pantryToList);

  const lists = useQuery({
    queryKey: keys.lists(),
    queryFn: () => trpc.lists.list.query(),
  });

  return (
    <Modal title="Aggiungi i mancanti a una lista" onClose={onClose}>
      <p className="muted">
        {alerts.length} prodotti sotto soglia. Quelli già presenti e non
        spuntati nella lista scelta verranno saltati.
      </p>

      <Field label="Lista">
        {(props) => (
          <select
            {...props}
            value={listId}
            onChange={(event) => setListId(event.target.value)}
          >
            <option value="">Scegli…</option>
            {(lists.data ?? []).map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="modal__actions">
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="primary"
          disabled={listId === "" || toList.isPending}
          onClick={() =>
            toList.mutate(
              {
                mutationId: newMutationId(),
                pantryId,
                listId,
                entries: alerts.map((alert) => ({
                  nodeId: alert.node.id,
                  itemId: newId(),
                })),
              },
              {
                onSuccess: (result) => {
                  notify(
                    "success",
                    `${result.created.length} prodotti aggiunti alla lista.`,
                  );
                  onClose();
                },
              },
            )
          }
        >
          Aggiungi
        </Button>
      </div>
    </Modal>
  );
};
