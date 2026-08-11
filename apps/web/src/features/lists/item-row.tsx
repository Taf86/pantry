import type {
  CheckItemInput,
  DeleteItemInput,
  ListItem,
  UncheckItemInput,
} from "pantry-shared";

import { Badge, Button } from "../../components/ui";
import { useAppMutation } from "../../hooks/use-app-mutation";
import { newMutationId } from "../../lib/ids";
import { MUTATION } from "../../lib/mutations";
import { formatQuantity } from "../../lib/format";

export const ItemRow = ({
  item,
  canWrite,
  canShop,
  listLabel,
  categoryName,
  onEdit,
}: {
  item: ListItem;
  canWrite: boolean;
  canShop: boolean;
  listLabel?: string | undefined;
  categoryName?: string | undefined;
  onEdit?: (item: ListItem) => void;
}) => {
  const check = useAppMutation<CheckItemInput>(MUTATION.itemCheck);
  const uncheck = useAppMutation<UncheckItemInput>(MUTATION.itemUncheck);
  const remove = useAppMutation<DeleteItemInput>(MUTATION.itemDelete);

  const checked = item.checkedAt !== null;

  const toggle = (): void => {
    if (!canShop) return;
    // L'istante è quello del dispositivo, non quello di arrivo al server:
    // è il perno del last-write-wins quando la spunta è fatta offline.
    const at = new Date().toISOString();
    if (checked) {
      uncheck.mutate({
        mutationId: newMutationId(),
        listId: item.listId,
        id: item.id,
        at,
      });
    } else {
      check.mutate({
        mutationId: newMutationId(),
        listId: item.listId,
        id: item.id,
        checkedAt: at,
      });
    }
  };

  const quantity = formatQuantity(item.quantity, item.unit);

  return (
    <div className={`item-row ${checked ? "item-row--checked" : ""}`}>
      <button
        type="button"
        className="item-row__check"
        aria-pressed={checked}
        aria-label={
          checked ? `Togli la spunta a ${item.name}` : `Spunta ${item.name}`
        }
        disabled={!canShop}
        onClick={toggle}
      >
        {checked ? "✓" : ""}
      </button>

      <div className="item-row__body">
        <span className="item-row__name">{item.name}</span>
        <div className="item-row__meta">
          {quantity !== null && <span>{quantity}</span>}
          {categoryName !== undefined && <span>{categoryName}</span>}
          {item.note !== null && item.note !== "" && <span>{item.note}</span>}
          {listLabel !== undefined && <Badge>{listLabel}</Badge>}
        </div>
      </div>

      {canWrite && (
        <div className="item-row__actions">
          {onEdit !== undefined && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => onEdit(item)}
              aria-label={`Modifica ${item.name}`}
            >
              Modifica
            </Button>
          )}
          <Button
            variant="ghost"
            size="small"
            aria-label={`Elimina ${item.name}`}
            onClick={() =>
              remove.mutate({
                mutationId: newMutationId(),
                listId: item.listId,
                id: item.id,
              })
            }
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
};
