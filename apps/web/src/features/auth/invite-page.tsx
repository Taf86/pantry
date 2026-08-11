import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MIN_PASSWORD_LENGTH } from "pantry-shared";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, Card, ErrorState, Field, Loading } from "../../components/ui";
import { signIn } from "../../lib/auth-client";
import { keys } from "../../lib/keys";
import { notify } from "../../lib/notify";
import { errorMessage, trpc } from "../../lib/trpc";

/**
 * Attivazione dell'account.
 *
 * È l'unico modo per entrare in un sistema senza auto-registrazione: il link
 * è stato consegnato a mano, e qui l'utente sceglie la password. Subito dopo
 * viene fatto il login, perché chiedergliela due volte di fila non ha senso.
 */
export const InvitePage = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: keys.invitePreview(token),
    queryFn: () => trpc.account.invitePreview.query({ token }),
    retry: false,
    networkMode: "online",
  });

  const accept = useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      trpc.account.acceptInvite.mutate(input),
    networkMode: "online",
    onSuccess: async (result) => {
      const signedIn = await signIn(result.email, password);
      if (signedIn.error) {
        notify("success", "Account attivato: ora puoi accedere.");
        void navigate("/login", { replace: true });
        return;
      }
      await client.invalidateQueries({ queryKey: keys.me() });
      void navigate("/lists", { replace: true });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  if (preview.isPending) return <Loading what="dell'invito" />;

  if (preview.isError) {
    return (
      <div className="centered-page">
        <Card className="centered-page__card">
          <ErrorState message="Questo invito non è valido o è scaduto. Chiedine uno nuovo all'amministratore." />
        </Card>
      </div>
    );
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`,
      );
      return;
    }
    if (password !== confirmation) {
      setError("Le due password non coincidono.");
      return;
    }
    accept.mutate({ token, password });
  };

  return (
    <div className="centered-page">
      <Card className="centered-page__card">
        <form className="stack" onSubmit={submit}>
          <h1>Benvenuto/a, {preview.data.displayName}</h1>
          <p className="muted">
            Scegli una password per l&apos;account {preview.data.email}.
          </p>

          <Field
            label="Password"
            hint={`Almeno ${MIN_PASSWORD_LENGTH} caratteri`}
          >
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>

          <Field label="Conferma password">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            )}
          </Field>

          {error !== null && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={accept.isPending}>
            {accept.isPending ? "Attivazione…" : "Attiva account"}
          </Button>
        </form>
      </Card>
    </div>
  );
};
