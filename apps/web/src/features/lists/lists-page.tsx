import { useQuery } from "@tanstack/react-query";
import {
  ROLE_LABELS,
  roleOf,
  type CreateListInput,
  type ListSummary,
} from "pantry-shared";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
} from "../../components/ui";
import { useAppMutation } from "../../hooks/use-app-mutation";
import { newId, newMutationId } from "../../lib/ids";
import { keys } from "../../lib/keys";
import { MUTATION } from "../../lib/mutations";
import { errorMessage, trpc } from "../../lib/trpc";

export const ListsPage = () => {
  const [creating, setCreating] = useState(false);

  const lists = useQuery({
    queryKey: keys.lists(),
    queryFn: () => trpc.lists.list.query(),
  });

  return (
    <>
      <div className="page-header">
        <h1>Liste della spesa</h1>
        <div className="page-header__actions">
          <Button variant="primary" onClick={() => setCreating(true)}>
            Nuova lista
          </Button>
        </div>
      </div>

      {lists.isPending && <Loading what="delle liste" />}

      {lists.isError && (
        <ErrorState
          message={errorMessage(lists.error)}
          onRetry={() => void lists.refetch()}
        />
      )}

      {lists.data && lists.data.length === 0 && (
        <Card>
          <Empty>
            Nessuna lista. Creane una: potrai condividerla con chi vuoi.
          </Empty>
        </Card>
      )}

      {lists.data && lists.data.length > 0 && (
        <Card>
          <ul className="list-rows">
            {lists.data.map((list) => (
              <li key={list.id}>
                <ListRow list={list} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating && <CreateListModal onClose={() => setCreating(false)} />}
    </>
  );
};

const ListRow = ({ list }: { list: ListSummary }) => {
  const role = roleOf(list.permissions);

  return (
    <Link to={`/lists/${list.id}`} className="link-card">
      <div className="row">
        <strong style={{ flex: 1 }}>{list.name}</strong>
        {role !== null && role !== "Owner" && (
          <Badge>{ROLE_LABELS[role]}</Badge>
        )}
        <Badge tone={list.openItemCount > 0 ? "accent" : "neutral"}>
          {list.openItemCount === 0
            ? "completata"
            : `${list.openItemCount} da comprare`}
        </Badge>
      </div>
      {list.memberCount > 1 && (
        <span className="muted">
          Condivisa con {list.memberCount - 1} persone
        </span>
      )}
    </Link>
  );
};

const CreateListModal = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState("");
  const create = useAppMutation<CreateListInput>(MUTATION.listCreate);

  const submit = (): void => {
    if (name.trim() === "") return;
    // L'ID nasce qui: la lista ha identità prima ancora della chiamata.
    create.mutate(
      { mutationId: newMutationId(), id: newId(), name: name.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title="Nuova lista" onClose={onClose}>
      <Field label="Nome">
        {(props) => (
          <input
            {...props}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        )}
      </Field>
      <div className="modal__actions">
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={create.isPending || name.trim() === ""}
        >
          Crea
        </Button>
      </div>
    </Modal>
  );
};
