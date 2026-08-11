import { useQuery } from "@tanstack/react-query";
import {
  buildTree,
  checkedItems,
  flattenTree,
  type ShoppingSession,
  type ToPantryInput,
} from "pantry-shared";
import { useMemo, useState } from "react";

import { Button, Empty, Field, Modal } from "../../components/ui";
import { useAppMutation } from "../../hooks/use-app-mutation";
import { newId, newMutationId } from "../../lib/ids";
import { keys } from "../../lib/keys";
import { MUTATION } from "../../lib/mutations";
import { notify } from "../../lib/notify";
import { trpc } from "../../lib/trpc";

/**
 * Il ritorno dal supermercato.
 *
 * Ogni lista mantiene il proprio trasferimento: la vista fusa è una comodità
 * del client, ma la scrittura resta indirizzata alla lista di origine — che è
 * anche l'unico modo di rispettare i permessi, che sono per lista.
 */
export const ToPantryDialog = ({
  session,
  onClose,
}: {
  session: ShoppingSession;
  onClose: () => void;
}) => {
  const [pantryId, setPantryId] = useState("");
  const [parentId, setParentId] = useState("");

  const transfer = useAppMutation<ToPantryInput>(MUTATION.shoppingToPantry);

  const pantries = useQuery({
    queryKey: keys.pantries(),
    queryFn: () => trpc.pantries.list.query(),
  });

  const nodes = useQuery({
    queryKey: keys.pantryNodes(pantryId),
    queryFn: () => trpc.nodes.tree.query({ pantryId }),
    enabled: pantryId !== "",
  });

  const containers = useMemo(
    () =>
      flattenTree(buildTree(nodes.data ?? [])).filter(
        ({ node }) => node.kind === "container",
      ),
    [nodes.data],
  );

  const perList = useMemo(
    () =>
      session.lists
        .map((entry) => ({
          listId: entry.listId,
          listName: entry.listName,
          items: checkedItems(entry.items),
        }))
        .filter((entry) => entry.items.length > 0),
    [session.lists],
  );

  const total = perList.reduce((sum, entry) => sum + entry.items.length, 0);

  const submit = async (): Promise<void> => {
    if (pantryId === "") return;

    for (const entry of perList) {
      await transfer.mutateAsync({
        mutationId: newMutationId(),
        listId: entry.listId,
        pantryId,
        parentId: parentId === "" ? null : parentId,
        // Anche gli ID di destinazione nascono nel client: il trasferimento
        // deve poter essere ritentato senza raddoppiare le giacenze.
        entries: entry.items.map((item) => ({
          itemId: item.id,
          nodeId: newId(),
        })),
        clearFromList: true,
      });
    }

    notify("success", `${total} prodotti trasferiti in dispensa.`);
    onClose();
  };

  return (
    <Modal title="Riponi la spesa" onClose={onClose}>
      {total === 0 ? (
        <Empty>Nessun prodotto spuntato da riporre.</Empty>
      ) : (
        <>
          <p className="muted">
            {total} prodotti spuntati da {perList.length}{" "}
            {perList.length === 1 ? "lista" : "liste"}. Verranno tolti dalle
            liste e aggiunti alla dispensa; gli omonimi già presenti nel
            contenitore scelto saranno incrementati.
          </p>

          <Field label="Dispensa">
            {(props) => (
              <select
                {...props}
                value={pantryId}
                onChange={(event) => {
                  setPantryId(event.target.value);
                  setParentId("");
                }}
              >
                <option value="">Scegli…</option>
                {(pantries.data ?? []).map((pantry) => (
                  <option key={pantry.id} value={pantry.id}>
                    {pantry.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Contenitore">
            {(props) => (
              <select
                {...props}
                value={parentId}
                disabled={pantryId === ""}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Radice della dispensa</option>
                {containers.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {" ".repeat(depth * 2)}
                    {node.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}

      <div className="modal__actions">
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="primary"
          disabled={pantryId === "" || total === 0 || transfer.isPending}
          onClick={() => void submit()}
        >
          Riponi
        </Button>
      </div>
    </Modal>
  );
};
