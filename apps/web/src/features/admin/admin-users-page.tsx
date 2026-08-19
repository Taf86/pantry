import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  createUserInput,
  type AdminUser,
  type AssignableUserStatus,
  type CreateUserInput,
  type InviteLink,
  type SignupRequest,
  type UserRole,
  type UserStatus,
} from "pantry-shared";
import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Loading,
  Modal,
} from "../../components/ui";
import { formatDate } from "../../lib/format";
import { keys } from "../../lib/keys";
import { notify } from "../../lib/notify";
import { errorMessage, trpc } from "../../lib/trpc";

const STATUS_TONE: Record<UserStatus, "accent" | "warning" | "danger"> = {
  active: "accent",
  unactivated: "warning",
  suspended: "danger",
};

/**
 * Backoffice: una rotta della stessa SPA, non una seconda applicazione.
 *
 * La protezione vera è `adminProcedure` lato server. Questa guardia lato
 * client serve solo a non mostrare una schermata che darebbe errori a ogni
 * chiamata.
 */
export const AdminUsersPage = () => {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{
    user: AdminUser;
    invite: InviteLink;
  } | null>(null);

  const users = useQuery({
    queryKey: keys.adminUsers(),
    queryFn: () => trpc.admin.users.list.query(),
    networkMode: "online",
  });

  const refresh = () =>
    void client.invalidateQueries({ queryKey: keys.adminUsers() });

  const regenerate = useMutation({
    mutationFn: (userId: string) =>
      trpc.admin.users.regenerateInvite.mutate({ userId }),
    networkMode: "online",
    onSuccess: (result) => {
      setIssued(result);
      refresh();
    },
    onError: (error) => notify("error", errorMessage(error)),
  });

  const setStatus = useMutation({
    mutationFn: (input: { userId: string; status: AssignableUserStatus }) =>
      trpc.admin.users.setStatus.mutate(input),
    networkMode: "online",
    onSuccess: refresh,
    onError: (error) => notify("error", errorMessage(error)),
  });

  const setRole = useMutation({
    mutationFn: (input: { userId: string; role: UserRole }) =>
      trpc.admin.users.setRole.mutate(input),
    networkMode: "online",
    onSuccess: refresh,
    onError: (error) => notify("error", errorMessage(error)),
  });

  return (
    <>
      <div className="page-header">
        <h1>Utenti</h1>
        <div className="page-header__actions">
          <Button variant="primary" onClick={() => setCreating(true)}>
            Nuovo utente
          </Button>
        </div>
      </div>

      <p className="muted">
        Gli account nascono qui: o li crei tu, o approvi una richiesta. In
        entrambi i casi il link di attivazione va consegnato a mano.
      </p>

      <SignupRequestsSection
        onApproved={(result) => {
          setIssued(result);
          refresh();
        }}
      />

      {users.isPending && <Loading what="degli utenti" />}
      {users.isError && (
        <ErrorState
          message={errorMessage(users.error)}
          onRetry={() => void users.refetch()}
        />
      )}

      {users.data && (
        <Card className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Stato</th>
                <th>Ruolo</th>
                <th>Ultimo accesso</th>
                <th aria-label="Azioni" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => (
                <tr key={user.id}>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>
                    <Badge tone={STATUS_TONE[user.status]}>
                      {USER_STATUS_LABELS[user.status]}
                    </Badge>
                    {user.hasPendingInvite && (
                      <>
                        {" "}
                        <Badge>invito aperto</Badge>
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={`Ruolo di ${user.displayName}`}
                      value={user.role}
                      onChange={(event) =>
                        setRole.mutate({
                          userId: user.id,
                          role: event.target.value as UserRole,
                        })
                      }
                    >
                      {(["user", "admin"] as const).map((role) => (
                        <option key={role} value={role}>
                          {USER_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatDate(user.lastSeenAt)}</td>
                  <td>
                    <div className="row">
                      <Button
                        size="small"
                        onClick={() => regenerate.mutate(user.id)}
                      >
                        Rigenera invito
                      </Button>
                      <Button
                        size="small"
                        variant={
                          user.status === "suspended" ? "default" : "danger"
                        }
                        onClick={() =>
                          setStatus.mutate({
                            userId: user.id,
                            status:
                              user.status === "suspended"
                                ? "active"
                                : "suspended",
                          })
                        }
                      >
                        {user.status === "suspended" ? "Riattiva" : "Sospendi"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setIssued(result);
            refresh();
          }}
        />
      )}

      {issued !== null && (
        <InviteModal issued={issued} onClose={() => setIssued(null)} />
      )}
    </>
  );
};

/**
 * La coda delle richieste di registrazione, sopra la tabella degli utenti.
 *
 * Sta nella stessa pagina perché è lo stesso lavoro: approvare una richiesta
 * *è* creare un utente, e finisce nella stessa modale con il link. Quando la
 * coda è vuota la sezione non c'è, così non occupa spazio nel caso normale.
 */
const SignupRequestsSection = ({
  onApproved,
}: {
  onApproved: (result: { user: AdminUser; invite: InviteLink }) => void;
}) => {
  const client = useQueryClient();

  const requests = useQuery({
    queryKey: keys.adminSignupRequests(),
    queryFn: () => trpc.admin.signupRequests.list.query(),
    networkMode: "online",
  });

  const refresh = () =>
    void client.invalidateQueries({ queryKey: keys.adminSignupRequests() });

  const approve = useMutation({
    mutationFn: (requestId: string) =>
      trpc.admin.signupRequests.approve.mutate({ requestId }),
    networkMode: "online",
    onSuccess: (result) => {
      refresh();
      onApproved(result);
    },
    onError: (error) => notify("error", errorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: (requestId: string) =>
      trpc.admin.signupRequests.reject.mutate({ requestId }),
    networkMode: "online",
    onSuccess: refresh,
    onError: (error) => notify("error", errorMessage(error)),
  });

  if (requests.isError) {
    return (
      <ErrorState
        message={errorMessage(requests.error)}
        onRetry={() => void requests.refetch()}
      />
    );
  }

  if (!requests.data || requests.data.length === 0) return null;

  const busy = approve.isPending || reject.isPending;

  return (
    <Card className="table-scroll">
      <h2>Richieste in attesa</h2>
      <p className="muted">
        Approvare genera il link di attivazione. Consegnalo al contatto
        indicato: è l&apos;unico modo che ha la persona di entrare.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Contatto</th>
            <th>Richiesta il</th>
            <th aria-label="Azioni" />
          </tr>
        </thead>
        <tbody>
          {requests.data.map((request: SignupRequest) => (
            <tr key={request.id}>
              <td>{request.displayName}</td>
              <td>{request.email}</td>
              <td>{request.contact}</td>
              <td>{formatDate(request.createdAt)}</td>
              <td>
                <div className="row">
                  <Button
                    size="small"
                    variant="primary"
                    disabled={busy}
                    onClick={() => approve.mutate(request.id)}
                  >
                    Approva
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    disabled={busy}
                    onClick={() => reject.mutate(request.id)}
                  >
                    Rifiuta
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

const CreateUserModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: { user: AdminUser; invite: InviteLink }) => void;
}) => {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: CreateUserInput) =>
      trpc.admin.users.create.mutate(input),
    networkMode: "online",
    onSuccess: onCreated,
    onError: (cause) => setError(errorMessage(cause)),
  });

  const submit = (): void => {
    const parsed = createUserInput.safeParse({ email, displayName, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dati non validi");
      return;
    }
    setError(null);
    create.mutate(parsed.data);
  };

  return (
    <Modal title="Nuovo utente" onClose={onClose}>
      <Field label="Email">
        {(props) => (
          <input
            {...props}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>

      <Field label="Nome">
        {(props) => (
          <input
            {...props}
            value={displayName}
            maxLength={120}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        )}
      </Field>

      <Field label="Ruolo">
        {(props) => (
          <select
            {...props}
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="user">Utente</option>
            <option value="admin">Amministratore</option>
          </select>
        )}
      </Field>

      {error !== null && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="modal__actions">
        <Button onClick={onClose}>Annulla</Button>
        <Button variant="primary" onClick={submit} disabled={create.isPending}>
          Crea e genera invito
        </Button>
      </div>
    </Modal>
  );
};

/**
 * Il link compare una volta sola.
 *
 * Non è un vezzo di sicurezza teatrale: in database c'è solo lo SHA-256 del
 * token, quindi nemmeno il server sarebbe in grado di rimostrarlo. Se si
 * perde, se ne rigenera un altro.
 */
const InviteModal = ({
  issued,
  onClose,
}: {
  issued: { user: AdminUser; invite: InviteLink };
  onClose: () => void;
}) => {
  const url = `${window.location.origin}/invite/${issued.invite.token}`;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      notify("success", "Link copiato negli appunti.");
    } catch {
      notify("warning", "Copia non riuscita: seleziona il link a mano.");
    }
  };

  return (
    <Modal title={`Invito per ${issued.user.displayName}`} onClose={onClose}>
      <p className="muted">
        Consegna questo link fuori banda. Scade il{" "}
        {formatDate(issued.invite.expiresAt)} e{" "}
        <strong>non sarà più recuperabile</strong>: se si perde, rigeneralo.
      </p>

      <code className="token-box">{url}</code>

      <div className="modal__actions">
        <Button onClick={() => void copy()}>Copia</Button>
        <Button variant="primary" onClick={onClose}>
          Fatto
        </Button>
      </div>
    </Modal>
  );
};
