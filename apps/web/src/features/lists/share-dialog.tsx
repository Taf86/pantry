import { useQuery } from "@tanstack/react-query";
import {
  ROLE_LABELS,
  ROLE_NAMES,
  Role,
  describePermissions,
  roleOf,
  type ListDetail,
  type RoleName,
  type ShareListInput,
  type UnshareListInput,
} from "pantry-shared";
import { useState } from "react";

import { Badge, Button, Field, Modal } from "../../components/ui";
import { useAppMutation } from "../../hooks/use-app-mutation";
import { newMutationId } from "../../lib/ids";
import { keys } from "../../lib/keys";
import { MUTATION } from "../../lib/mutations";
import { trpc } from "../../lib/trpc";

/**
 * Condivisione con permessi.
 *
 * I ruoli sono nomi per maschere di bit, non un secondo modello: la
 * distinzione che conta è "può fare la spesa" contro "può modificare", ed è
 * quella che va spiegata all'utente.
 */
export const ShareDialog = ({
  detail,
  onClose,
}: {
  detail: ListDetail;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleName>("Editor");

  const share = useAppMutation<ShareListInput>(MUTATION.listShare);
  const unshare = useAppMutation<UnshareListInput>(MUTATION.listUnshare);

  const candidates = useQuery({
    queryKey: keys.userSearch(query),
    queryFn: () => trpc.account.searchUsers.query({ query }),
    enabled: query.trim().length >= 2,
    networkMode: "online",
  });

  const existing = new Set(detail.members.map((member) => member.user.id));

  return (
    <Modal title={`Condivisione · ${detail.name}`} onClose={onClose}>
      <ul className="list-rows" aria-label="Membri">
        {detail.members.map((member) => {
          const memberRole = roleOf(member.permissions);
          const isOwner = member.user.id === detail.ownerId;
          return (
            <li key={member.user.id} className="item-row">
              <div className="item-row__body">
                <span className="item-row__name">
                  {member.user.displayName}
                </span>
                <div className="item-row__meta">
                  <span>{member.user.email}</span>
                  <Badge tone={isOwner ? "accent" : "neutral"}>
                    {isOwner
                      ? "Proprietario"
                      : memberRole !== null
                        ? ROLE_LABELS[memberRole]
                        : describePermissions(member.permissions).join(", ")}
                  </Badge>
                </div>
              </div>
              {!isOwner && (
                <Button
                  size="small"
                  variant="ghost"
                  aria-label={`Rimuovi ${member.user.displayName}`}
                  onClick={() =>
                    unshare.mutate({
                      mutationId: newMutationId(),
                      listId: detail.id,
                      userId: member.user.id,
                    })
                  }
                >
                  Rimuovi
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Field label="Cerca una persona" hint="Almeno due caratteri">
        {(props) => (
          <input
            {...props}
            value={query}
            placeholder="Nome o email"
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
      </Field>

      <Field label="Permessi">
        {(props) => (
          <select
            {...props}
            value={role}
            onChange={(event) => setRole(event.target.value as RoleName)}
          >
            {ROLE_NAMES.map((name) => (
              <option key={name} value={name}>
                {ROLE_LABELS[name]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <ul className="list-rows">
        {(candidates.data ?? [])
          .filter((candidate) => !existing.has(candidate.id))
          .map((candidate) => (
            <li key={candidate.id} className="item-row">
              <div className="item-row__body">
                <span className="item-row__name">{candidate.displayName}</span>
                <div className="item-row__meta">
                  <span>{candidate.email}</span>
                </div>
              </div>
              <Button
                size="small"
                onClick={() =>
                  share.mutate({
                    mutationId: newMutationId(),
                    listId: detail.id,
                    userId: candidate.id,
                    permissions: Role[role],
                  })
                }
              >
                Aggiungi
              </Button>
            </li>
          ))}
      </ul>

      <div className="modal__actions">
        <Button onClick={onClose}>Chiudi</Button>
      </div>
    </Modal>
  );
};
