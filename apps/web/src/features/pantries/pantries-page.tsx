import { useQuery } from "@tanstack/react-query";
import { ROLE_LABELS, roleOf, type CreatePantryInput } from "pantry-shared";
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

export const PantriesPage = () => {
  const [creating, setCreating] = useState(false);

  const pantries = useQuery({
    queryKey: keys.pantries(),
    queryFn: () => trpc.pantries.list.query(),
  });

  return (
    <>
      <div className="page-header">
        <h1>Dispense</h1>
        <div className="page-header__actions">
          <Button variant="primary" onClick={() => setCreating(true)}>
            Nuova dispensa
          </Button>
        </div>
      </div>

      {pantries.isPending && <Loading what="delle dispense" />}
      {pantries.isError && (
        <ErrorState
          message={errorMessage(pantries.error)}
          onRetry={() => void pantries.refetch()}
        />
      )}

      {pantries.data && pantries.data.length === 0 && (
        <Card>
          <Empty>
            Nessuna dispensa. Una dispensa è un albero di contenitori: armadio →
            scaffale → cassetto → prodotto.
          </Empty>
        </Card>
      )}

      {pantries.data && pantries.data.length > 0 && (
        <Card>
          <ul className="list-rows">
            {pantries.data.map((pantry) => {
              const role = roleOf(pantry.permissions);
              return (
                <li key={pantry.id}>
                  <Link to={`/pantries/${pantry.id}`} className="link-card">
                    <div className="row">
                      <strong style={{ flex: 1 }}>{pantry.name}</strong>
                      {role !== null && role !== "Owner" && (
                        <Badge>{ROLE_LABELS[role]}</Badge>
                      )}
                      <Badge>{pantry.itemCount} prodotti</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {creating && <CreatePantryModal onClose={() => setCreating(false)} />}
    </>
  );
};

const CreatePantryModal = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState("");
  const create = useAppMutation<CreatePantryInput>(MUTATION.pantryCreate);

  const submit = (): void => {
    if (name.trim() === "") return;
    create.mutate(
      { mutationId: newMutationId(), id: newId(), name: name.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title="Nuova dispensa" onClose={onClose}>
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
