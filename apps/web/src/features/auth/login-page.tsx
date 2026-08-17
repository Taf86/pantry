import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Button, Card, Field } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { signIn } from "../../lib/auth-client";
import { keys } from "../../lib/keys";
import { trpc } from "../../lib/trpc";

export const LoginPage = () => {
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Le richieste di registrazione si aprono per configurazione: se sono chiuse,
   * proporre il modulo sarebbe un vicolo cieco.
   */
  const signup = useQuery({
    queryKey: keys.signupInfo(),
    queryFn: () => trpc.account.signupInfo.query(),
    retry: false,
    networkMode: "online",
  });

  if (session.data) return <Navigate to="/lists" replace />;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await signIn(email, password);

    if (result.error) {
      // Nessun dettaglio su quale dei due campi è sbagliato: dirlo
      // significherebbe confermare quali email esistono.
      setError("Email o password non corretti.");
      setBusy(false);
      return;
    }

    await client.invalidateQueries({ queryKey: keys.me() });
    void navigate("/lists", { replace: true });
  };

  return (
    <div className="centered-page">
      <Card className="centered-page__card">
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <h1>Pantry</h1>
          <p className="muted">
            {signup.data?.open === true ? (
              <>
                Gli account li approva l&apos;amministratore: se non ne hai uno,{" "}
                <Link to="/signup">chiedine uno</Link>.
              </>
            ) : (
              <>
                Gli account li crea l&apos;amministratore: se non ne hai uno,
                chiedi un link di invito.
              </>
            )}
          </p>

          <Field label="Email">
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>

          <Field label="Password">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>

          {error !== null && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Accesso…" : "Entra"}
          </Button>
        </form>
      </Card>
    </div>
  );
};
