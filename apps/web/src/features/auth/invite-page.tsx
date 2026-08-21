import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MIN_PASSWORD_LENGTH } from "@pantry/shared";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { signIn } from "../../lib/auth-client";
import { keys } from "../../lib/keys";
import { errorMessage, trpc } from "../../lib/trpc";
import { toast } from "@/components/ui/toast";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function InvitePage() {
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
        toast.add({ description: "Account activated, you can login now." });
        void navigate("/login", { replace: true });
        return;
      }
      await client.invalidateQueries({ queryKey: keys.me() });
      void navigate("/lists", { replace: true });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  if (preview.isPending) {
    return <div>Loading</div>;
  }

  if (preview.isError) {
    return <div>Error</div>;
  }

  const submit: React.SubmitEventHandler<HTMLFormElement> = (event): void => {
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
    <div className="w-full max-w-md">
      <form onSubmit={submit}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Sign up</FieldLegend>
            <FieldDescription>
              Welcome {preview.data.displayName}, choose a password for{" "}
              {preview.data.email} account.
            </FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-password">Password</FieldLabel>
                <Input
                  id="invite-password"
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-confirm-password">
                  Confirm password
                </FieldLabel>
                <Input
                  id="invite-confirm-password"
                  required
                  type="password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
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
            <Button type="submit" disabled={accept.isPending}>
              Submit
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
