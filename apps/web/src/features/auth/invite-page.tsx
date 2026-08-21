import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MIN_PASSWORD_LENGTH, type InvitePreview } from "@pantry/shared";
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm, type SubmitHandler } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormField } from "@/components/form-field";

export default function InvitePage() {
  const { token = "" } = useParams();

  const preview = useQuery({
    queryKey: keys.invitePreview(token),
    queryFn: () => trpc.account.invitePreview.query({ token }),
    retry: false,
    networkMode: "online",
  });

  if (preview.isPending) {
    return <div>Loading</div>;
  }

  if (preview.isError || !preview.data) {
    return <div>Error</div>;
  }

  return <Form invite={preview.data} token={token} />;
}

const formSchema = z
  .object({
    password: z.string().trim().min(MIN_PASSWORD_LENGTH),
    confirmation: z.string(),
  })
  .check((ctx) => {
    const { password, confirmation } = ctx.value;
    if (confirmation !== password) {
      ctx.issues.push({
        path: ["confirmation"],
        code: "custom",
        message: "Passwords don't match",
        input: confirmation,
      });
    }
  });

function Form({ invite, token }: { invite: InvitePreview; token: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { confirmation: "", password: "" },
  });

  const accept = useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      trpc.account.acceptInvite.mutate(input),
    networkMode: "online",
    onSuccess: async (result, variables) => {
      const signedIn = await signIn(result.email, variables.password);
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
  const onValid: SubmitHandler<z.infer<typeof formSchema>, unknown> = (
    data,
    event,
  ) => {
    event?.preventDefault();
    setError(null);
    accept.mutate({ token, password: data.password });
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Sign up</FieldLegend>
            <FieldDescription>
              Welcome {invite.displayName}, choose a password for {invite.email}{" "}
              account.
            </FieldDescription>
            <FieldGroup>
              <FormField
                name="password"
                control={form.control}
                label="Password"
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="password"
                  />
                )}
              </FormField>

              <FormField
                name="confirmation"
                control={form.control}
                label="Confirm password"
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="password"
                  />
                )}
              </FormField>
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
