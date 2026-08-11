import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_EXPIRING_WITHIN_DAYS,
  Permission,
  buildTree,
  can,
  daysUntil,
  expiryStatus,
  flattenTree,
  isBelowThreshold,
  wouldCycle,
  type ConsumeNodeInput,
  type CreateNodeInput,
  type DeleteNodeInput,
  type MoveNodeInput,
  type PantryNode,
  type UpdateNodeInput,
} from "pantry-shared";
import { useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

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
import { formatDays, formatQuantity } from "../../lib/format";
import { newId, newMutationId } from "../../lib/ids";
import { keys } from "../../lib/keys";
import { MUTATION } from "../../lib/mutations";
import { trpc } from "../../lib/trpc";
import { useRooms } from "../../hooks/use-rooms";
import { MissingPanel } from "./missing-panel";

export const PantryDetailPage = () => {
  const { pantryId = "" } = useParams();
  const [editing, setEditing] = useState<PantryNode | null>(null);
  const [moving, setMoving] = useState<PantryNode | null>(null);

  useRooms({ pantries: [pantryId] });

  const detail = useQuery({
    queryKey: keys.pantry(pantryId),
    queryFn: () => trpc.pantries.get.query({ pantryId }),
  });

  const nodes = useQuery({
    queryKey: keys.pantryNodes(pantryId),
    queryFn: () => trpc.nodes.tree.query({ pantryId }),
  });

  const permissions = detail.data?.permissions ?? 0;
  const canWrite = can(permissions, Permission.Write);
  const canShop = can(permissions, Permission.Shop);

  const flat = useMemo(
    () => flattenTree(buildTree(nodes.data ?? [])),
    [nodes.data],
  );

  if (detail.isPending) return <Loading what="della dispensa" />;
  if (detail.isError) {
    return (
      <ErrorState
        message="Dispensa non raggiungibile"
        onRetry={() => void detail.refetch()}
      />
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{detail.data.name}</h1>
      </div>

      <MissingPanel pantryId={pantryId} canWrite={canWrite} />

      {canWrite && <NodeForm pantryId={pantryId} nodes={nodes.data ?? []} />}

      {nodes.isPending && <Loading what="della dispensa" />}

      {nodes.data && (
        <Card>
          {flat.length === 0 ? (
            <Empty>
              Dispensa vuota. Comincia da un contenitore — un armadio, un frigo
              — e annidaci dentro ciò che serve.
            </Empty>
          ) : (
            <ul className="tree">
              {flat.map(({ node, depth }) => (
                <li key={node.id}>
                  <NodeRow
                    node={node}
                    depth={depth}
                    canWrite={canWrite}
                    canShop={canShop}
                    onEdit={setEditing}
                    onMove={setMoving}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {editing !== null && (
        <EditNodeModal node={editing} onClose={() => setEditing(null)} />
      )}

      {moving !== null && (
        <MoveNodeModal
          node={moving}
          nodes={nodes.data ?? []}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
};

const NodeRow = ({
  node,
  depth,
  canWrite,
  canShop,
  onEdit,
  onMove,
}: {
  node: PantryNode;
  depth: number;
  canWrite: boolean;
  canShop: boolean;
  onEdit: (node: PantryNode) => void;
  onMove: (node: PantryNode) => void;
}) => {
  const consume = useAppMutation<ConsumeNodeInput>(MUTATION.nodeConsume);
  const remove = useAppMutation<DeleteNodeInput>(MUTATION.nodeDelete);

  const status = expiryStatus(node, DEFAULT_EXPIRING_WITHIN_DAYS);
  const quantity = formatQuantity(node.quantity, node.unit);

  return (
    <div
      className="tree__node"
      style={{ paddingLeft: `${0.85 + depth * 1.1}rem` }}
    >
      <span aria-hidden="true">{node.kind === "container" ? "📦" : "•"}</span>

      <div className="tree__label">
        <span>{node.name}</span>
        {quantity !== null && <span className="muted">{quantity}</span>}
        {isBelowThreshold(node) && <Badge tone="warning">manca</Badge>}
        {status === "expired" && <Badge tone="danger">scaduto</Badge>}
        {status === "expiring" && node.expiresAt !== null && (
          <Badge tone="warning">
            scade {formatDays(daysUntil(node.expiresAt))}
          </Badge>
        )}
      </div>

      {node.kind === "item" && canShop && (
        <Button
          size="small"
          variant="ghost"
          aria-label={`Consuma una unità di ${node.name}`}
          disabled={(node.quantity ?? 0) <= 0}
          onClick={() =>
            consume.mutate({
              mutationId: newMutationId(),
              pantryId: node.pantryId,
              id: node.id,
              delta: 1,
            })
          }
        >
          −1
        </Button>
      )}

      {canWrite && (
        <>
          <Button size="small" variant="ghost" onClick={() => onEdit(node)}>
            Modifica
          </Button>
          <Button size="small" variant="ghost" onClick={() => onMove(node)}>
            Sposta
          </Button>
          <Button
            size="small"
            variant="ghost"
            aria-label={`Elimina ${node.name}`}
            onClick={() =>
              remove.mutate({
                mutationId: newMutationId(),
                pantryId: node.pantryId,
                id: node.id,
              })
            }
          >
            ✕
          </Button>
        </>
      )}
    </div>
  );
};

const NodeForm = ({
  pantryId,
  nodes,
}: {
  pantryId: string;
  nodes: PantryNode[];
}) => {
  const [kind, setKind] = useState<"container" | "item">("item");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const create = useAppMutation<CreateNodeInput>(MUTATION.nodeCreate);

  const containers = useMemo(
    () =>
      flattenTree(buildTree(nodes)).filter(
        ({ node }) => node.kind === "container",
      ),
    [nodes],
  );

  const numberOrNull = (value: string): number | null => {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;

    create.mutate({
      mutationId: newMutationId(),
      pantryId,
      id: newId(),
      parentId: parentId === "" ? null : parentId,
      kind,
      name: name.trim(),
      quantity: kind === "item" ? numberOrNull(quantity) : null,
      unit: kind === "item" && unit.trim() !== "" ? unit.trim() : null,
      minQuantity: kind === "item" ? numberOrNull(minQuantity) : null,
      expiresAt: kind === "item" && expiresAt !== "" ? expiresAt : null,
    });

    setName("");
    setQuantity("");
    setExpiresAt("");
  };

  return (
    <Card>
      <form
        className="stack"
        style={{ padding: "0.85rem" }}
        onSubmit={submit}
        aria-label="Aggiungi alla dispensa"
      >
        <div className="form-grid">
          <Field label="Tipo">
            {(props) => (
              <select
                {...props}
                value={kind}
                onChange={(event) =>
                  setKind(
                    event.target.value === "container" ? "container" : "item",
                  )
                }
              >
                <option value="item">Prodotto</option>
                <option value="container">Contenitore</option>
              </select>
            )}
          </Field>

          <Field label="Dentro">
            {(props) => (
              <select
                {...props}
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Radice</option>
                {containers.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {" ".repeat(depth * 2)}
                    {node.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field label="Nome">
          {(props) => (
            <input
              {...props}
              value={name}
              maxLength={120}
              placeholder={kind === "container" ? "Armadio cucina" : "Biscotti"}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        {kind === "item" && (
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
            <Field label="Soglia" hint="Sotto questa quantità risulta mancante">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={minQuantity}
                  onChange={(event) => setMinQuantity(event.target.value)}
                />
              )}
            </Field>
            <Field label="Scadenza">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        <Button type="submit" variant="primary" disabled={name.trim() === ""}>
          Aggiungi
        </Button>
      </form>
    </Card>
  );
};

const EditNodeModal = ({
  node,
  onClose,
}: {
  node: PantryNode;
  onClose: () => void;
}) => {
  const [name, setName] = useState(node.name);
  const [quantity, setQuantity] = useState(
    node.quantity === null ? "" : String(node.quantity),
  );
  const [unit, setUnit] = useState(node.unit ?? "");
  const [minQuantity, setMinQuantity] = useState(
    node.minQuantity === null ? "" : String(node.minQuantity),
  );
  const [expiresAt, setExpiresAt] = useState(node.expiresAt ?? "");

  const update = useAppMutation<UpdateNodeInput>(MUTATION.nodeUpdate);

  const numberOrNull = (value: string): number | null => {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const submit = (): void => {
    update.mutate(
      {
        mutationId: newMutationId(),
        pantryId: node.pantryId,
        id: node.id,
        version: node.version,
        name: name.trim(),
        ...(node.kind === "item"
          ? {
              quantity: numberOrNull(quantity),
              unit: unit.trim() === "" ? null : unit.trim(),
              minQuantity: numberOrNull(minQuantity),
              expiresAt: expiresAt === "" ? null : expiresAt,
            }
          : {}),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title={`Modifica ${node.name}`} onClose={onClose}>
      <Field label="Nome">
        {(props) => (
          <input
            {...props}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      {node.kind === "item" && (
        <div className="form-grid">
          <Field label="Quantità">
            {(props) => (
              <input
                {...props}
                type="number"
                min="0"
                step="any"
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
          <Field label="Soglia">
            {(props) => (
              <input
                {...props}
                type="number"
                min="0"
                step="any"
                value={minQuantity}
                onChange={(event) => setMinQuantity(event.target.value)}
              />
            )}
          </Field>
          <Field label="Scadenza">
            {(props) => (
              <input
                {...props}
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            )}
          </Field>
        </div>
      )}

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

const MoveNodeModal = ({
  node,
  nodes,
  onClose,
}: {
  node: PantryNode;
  nodes: PantryNode[];
  onClose: () => void;
}) => {
  const [parentId, setParentId] = useState(node.parentId ?? "");
  const move = useAppMutation<MoveNodeInput>(MUTATION.nodeMove);

  /**
   * Le destinazioni illegali non compaiono nemmeno nell'elenco.
   *
   * Il server rifà comunque il controllo dentro la transazione — è lui
   * l'autorità sull'invariante — ma proporre una scelta che verrà rifiutata è
   * solo un modo per far sbagliare l'utente.
   */
  const options = useMemo(
    () =>
      flattenTree(buildTree(nodes)).filter(
        ({ node: candidate }) =>
          candidate.kind === "container" &&
          candidate.id !== node.id &&
          !wouldCycle(nodes, node.id, candidate.id),
      ),
    [nodes, node.id],
  );

  return (
    <Modal title={`Sposta ${node.name}`} onClose={onClose}>
      <Field label="Destinazione">
        {(props) => (
          <select
            {...props}
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Radice della dispensa</option>
            {options.map(({ node: candidate, depth }) => (
              <option key={candidate.id} value={candidate.id}>
                {" ".repeat(depth * 2)}
                {candidate.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="modal__actions">
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="primary"
          disabled={move.isPending}
          onClick={() =>
            move.mutate(
              {
                mutationId: newMutationId(),
                pantryId: node.pantryId,
                id: node.id,
                parentId: parentId === "" ? null : parentId,
              },
              { onSuccess: onClose },
            )
          }
        >
          Sposta
        </Button>
      </div>
    </Modal>
  );
};
