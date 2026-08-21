import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { keys } from "@/lib/keys";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();
  const client = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    console.log({ email, password });
    const result = await signIn(email, password);

    if (result.error) {
      setError("Email o password non corretti.");
      setBusy(false);
      return;
    }

    await client.invalidateQueries({ queryKey: keys.me() });
    void navigate("/lists", { replace: true });
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Login</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="login-email">Email</FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          {error !== null && (
            <Field orientation="horizontal">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircleIcon />
                <AlertTitle>Signup failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </Field>
          )}
          <Field orientation="horizontal">
            <Button type="submit" disabled={busy}>
              Submit
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
