import { useMutation, useQuery } from "@tanstack/react-query";
import { signupRequestInput, type SignupRequestInput } from "pantry-shared";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button, Card, Field, Loading } from "../../components/ui";
import { keys } from "../../lib/keys";
import { errorMessage, trpc } from "../../lib/trpc";

/**
 * Richiesta di registrazione.
 *
 * Non crea un account: crea una riga in coda. L'amministratore approva e
 * consegna il link di attivazione al contatto indicato qui — che è il motivo
 * per cui quel campo non è opzionale (§5).
 */
export const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const info = useQuery({
    queryKey: keys.signupInfo(),
    queryFn: () => trpc.account.signupInfo.query(),
    retry: false,
    networkMode: "online",
  });

  const request = useMutation({
    mutationFn: (input: SignupRequestInput) =>
      trpc.account.requestSignup.mutate(input),
    networkMode: "online",
    onError: (cause) => setError(errorMessage(cause)),
  });

  if (info.isPending) return <Loading what="del modulo" />;

  if (info.isError || info.data.open === false) {
    return (
      <div className="centered-page">
        <Card className="centered-page__card">
          <div className="stack">
            <h1>Richieste chiuse</h1>
            <p className="muted">
              Questa istanza non accetta richieste di registrazione. Se ti serve
              un account, chiedilo direttamente a chi amministra Pantry.
            </p>
            <Link to="/login">Torna al login</Link>
          </div>
        </Card>
      </div>
    );
  }

  /**
   * L'esito è volutamente indistinguibile: che l'indirizzo fosse libero, già
   * registrato o già in coda, la risposta è questa. Dire il contrario
   * significherebbe raccontare a chiunque quali email esistono.
   */
  if (request.isSuccess) {
    return (
      <div className="centered-page">
        <Card className="centered-page__card">
          <div className="stack">
            <h1>Richiesta inviata</h1>
            <p className="muted">
              Se viene accettata, un amministratore ti manderà un link di
              attivazione al contatto che hai indicato. Non c&apos;è niente da
              controllare qui: l&apos;account non esiste ancora.
            </p>
            <Link to="/login">Torna al login</Link>
          </div>
        </Card>
      </div>
    );
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    if (info.data.requiresCode && code.trim() === "") {
      setError("Questa istanza richiede un codice di registrazione.");
      return;
    }

    const parsed = signupRequestInput.safeParse({
      email,
      displayName,
      contact,
      ...(code.trim() === "" ? {} : { code }),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dati non validi");
      return;
    }
    request.mutate(parsed.data);
  };

  return (
    <div className="centered-page">
      <Card className="centered-page__card">
        <form className="stack" onSubmit={submit}>
          <h1>Chiedi un account</h1>
          <p className="muted">
            Gli account li approva un amministratore. Non scegli una password
            adesso: la scegli dopo, aprendo il link di attivazione.
          </p>

          <Field label="Email">
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>

          <Field label="Nome">
            {(props) => (
              <input
                {...props}
                autoComplete="name"
                required
                maxLength={120}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Come ti ricontattiamo"
            hint="Telefono, WhatsApp, Telegram: è lì che arriverà il link."
          >
            {(props) => (
              <input
                {...props}
                required
                maxLength={200}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
              />
            )}
          </Field>

          {info.data.requiresCode && (
            <Field label="Codice di registrazione">
              {(props) => (
                <input
                  {...props}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              )}
            </Field>
          )}

          {error !== null && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={request.isPending}>
            {request.isPending ? "Invio…" : "Invia richiesta"}
          </Button>

          <Link to="/login">Torna al login</Link>
        </form>
      </Card>
    </div>
  );
};
