import { useQuery } from "@tanstack/react-query";
import {
  Permission,
  can,
  type AddItemInput,
  type Category,
  type DeleteListInput,
  type ListItem,
  type UpdateItemInput,
} from "pantry-shared";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
} from "../../components/ui";
import { useAppMutation } from "../../hooks/use-app-mutation";
import { useSession } from "../../hooks/use-session";
import { useRooms } from "../../hooks/use-rooms";
import { newId, newMutationId } from "../../lib/ids";
import { keys } from "../../lib/keys";
import { MUTATION } from "../../lib/mutations";
import { errorMessage, trpc } from "../../lib/trpc";
import { ItemRow } from "./item-row";
import { ShareDialog } from "./share-dialog";

export const ListDetailPage = () => {
  const { listId = "" } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [sharing, setSharing] = useState(false);

  useRooms({ lists: [listId] });

  const detail = useQuery({
    queryKey: keys.list(listId),
    queryFn: () => trpc.lists.get.query({ listId }),
  });

  const items = useQuery({
    queryKey: keys.listItems(listId),
    queryFn: () => trpc.items.list.query({ listId, includeDeleted: false }),
  });

  const categories = useQuery({
    queryKey: keys.categories(),
    queryFn: () => trpc.account.categories.query(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const session = useSession();
  const removeList = useAppMutation<DeleteListInput>(MUTATION.listDelete);

  const permissions = detail.data?.permissions ?? 0;
  const canWrite = can(permissions, Permission.Write);
  const canShop = can(permissions, Permission.Shop);
  const canManage = can(permissions, Permission.Manage);
  const isOwner = detail.data?.ownerId === session.data?.id;

  const categoryNames = useMemo(
    () =>
      new Map((categories.data ?? []).map((entry) => [entry.id, entry.name])),
    [categories.data],
  );

  const { open, done } = useMemo(() => {
    const all = items.data ?? [];
    return {
      open: all.filter((item) => item.checkedAt === null),
      done: all.filter((item) => item.checkedAt !== null),
    };
  }, [items.data]);

  if (detail.isPending) return <Loading what="della lista" />;
  if (detail.isError) {
    return (
      <ErrorState
        message={errorMessage(detail.error)}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{detail.data.name}</h1>
        <div className="page-header__actions">
          {canManage && (
            <Button size="small" onClick={() => setSharing(true)}>
              Condivisione
            </Button>
          )}
          {isOwner && (
            <Button
              size="small"
              variant="danger"
              onClick={() => {
                removeList.mutate(
                  { mutationId: newMutationId(), listId },
                  { onSuccess: () => void navigate("/lists") },
                );
              }}
            >
              Elimina
            </Button>
          )}
        </div>
      </div>

      {canWrite && (
        <AddItemForm listId={listId} categories={categories.data ?? []} />
      )}

      {items.isPending && <Loading what="dei prodotti" />}

      {items.data && (
        <Card>
          {open.length === 0 && done.length === 0 && (
            <Empty>Lista vuota. Aggiungi il primo prodotto qui sopra.</Empty>
          )}

          <ul className="list-rows">
            {open.map((item) => (
              <li key={item.id}>
                <ItemRow
                  item={item}
                  canWrite={canWrite}
                  canShop={canShop}
                  categoryName={
                    item.categoryId === null
                      ? undefined
                      : categoryNames.get(item.categoryId)
                  }
                  onEdit={setEditing}
                />
              </li>
            ))}
          </ul>

          {done.length > 0 && (
            <>
              <p className="group-heading">Nel carrello ({done.length})</p>
              <ul className="list-rows">
                {done.map((item) => (
                  <li key={item.id}>
                    <ItemRow
                      item={item}
                      canWrite={canWrite}
                      canShop={canShop}
                      categoryName={
                        item.categoryId === null
                          ? undefined
                          : categoryNames.get(item.categoryId)
                      }
                      onEdit={setEditing}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {editing !== null && (
        <EditItemModal
          item={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {sharing && (
        <ShareDialog detail={detail.data} onClose={() => setSharing(false)} />
      )}
    </>
  );
};

const AddItemForm = ({
  listId,
  categories,
}: {
  listId: string;
  categories: Category[];
}) => {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const add = useAppMutation<AddItemInput>(MUTATION.itemAdd);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;

    const parsedQuantity = quantity.trim() === "" ? null : Number(quantity);

    add.mutate({
      mutationId: newMutationId(),
      listId,
      id: newId(),
      name: trimmed,
      quantity:
        parsedQuantity !== null && Number.isFinite(parsedQuantity)
          ? parsedQuantity
          : null,
      unit: unit.trim() === "" ? null : unit.trim(),
      categoryId: categoryId === "" ? null : categoryId,
    });

    // Il campo si svuota subito: l'aggiornamento è ottimistico e non c'è
    // niente da aspettare, nemmeno senza rete.
    setName("");
    setQuantity("");
  };

  return (
    <Card>
      <form
        className="stack"
        style={{ padding: "0.85rem" }}
        onSubmit={submit}
        aria-label="Aggiungi prodotto"
      >
        <Field label="Prodotto">
          {(props) => (
            <input
              {...props}
              value={name}
              maxLength={120}
              placeholder="Latte, pane, detersivo…"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <div className="form-grid">
          <Field label="Quantità">
            {(props) => (
              <input
                {...props}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            )}
          </Field>

          <Field label="Unità">
            {(props) => (
              <input
                {...props}
                value={unit}
                maxLength={20}
                placeholder="kg, l, conf."
                onChange={(event) => setUnit(event.target.value)}
              />
            )}
          </Field>

          <Field label="Categoria">
            {(props) => (
              <select
                {...props}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Nessuna</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Button type="submit" variant="primary" disabled={name.trim() === ""}>
          Aggiungi
        </Button>
      </form>
    </Card>
  );
};

const EditItemModal = ({
  item,
  categories,
  onClose,
}: {
  item: ListItem;
  categories: Category[];
  onClose: () => void;
}) => {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(
    item.quantity === null ? "" : String(item.quantity),
  );
  const [unit, setUnit] = useState(item.unit ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [note, setNote] = useState(item.note ?? "");

  const update = useAppMutation<UpdateItemInput>(MUTATION.itemUpdate);

  const submit = (): void => {
    const parsed = quantity.trim() === "" ? null : Number(quantity);
    update.mutate(
      {
        mutationId: newMutationId(),
        listId: item.listId,
        id: item.id,
        // La versione attesa è quella che l'utente aveva davanti: se nel
        // frattempo qualcun altro ha modificato, il server rifiuta.
        version: item.version,
        name: name.trim(),
        quantity: parsed !== null && Number.isFinite(parsed) ? parsed : null,
        unit: unit.trim() === "" ? null : unit.trim(),
        categoryId: categoryId === "" ? null : categoryId,
        note: note.trim() === "" ? null : note.trim(),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title="Modifica prodotto" onClose={onClose}>
      <Field label="Prodotto">
        {(props) => (
          <input
            {...props}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <div className="form-grid">
        <Field label="Quantità">
          {(props) => (
            <input
              {...props}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          )}
        </Field>
        <Field label="Unità">
          {(props) => (
            <input
              {...props}
              value={unit}
              maxLength={20}
              onChange={(event) => setUnit(event.target.value)}
            />
          )}
        </Field>
        <Field label="Categoria">
          {(props) => (
            <select
              {...props}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Nessuna</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label="Nota">
        {(props) => (
          <input
            {...props}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>

      <div className="modal__actions">
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={update.isPending || name.trim() === ""}
        >
          Salva
        </Button>
      </div>
    </Modal>
  );
};
