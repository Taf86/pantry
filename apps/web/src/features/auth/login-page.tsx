import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { keys } from "@/lib/keys";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormField } from "@/components/form-field";
import { useTranslation } from "react-i18next";
import { requiredString } from "@/lib/zod";
import useErrorMessage from "@/hooks/use-error-message";

export default function LoginPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const client = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onValid: SubmitHandler<
    {
      email: string;
      password: string;
    },
    unknown
  > = async (data, event) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn(data.email, data.password);
    if (result.error) {
      setError(errorMessage(result.error));
      setLoading(false);
      return;
    }

    await client.invalidateQueries({ queryKey: keys.me() });
    void navigate("/lists", { replace: true });
  };

  const formSchema = z.object({
    email: z.email(),
    password: requiredString(t),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <div className="w-full max-w-md">
      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("feature.login.welcome")}</FieldLegend>
            <FieldGroup>
              <FormField
                name="email"
                control={form.control}
                label={t("feature.login.email")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="email"
                  />
                )}
              </FormField>

              <FormField
                name="password"
                control={form.control}
                label={t("feature.login.password")}
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
                <AlertAction>
                  <XIcon aria-hidden="true" onClick={() => setError(null)} />
                </AlertAction>
                <AlertCircleIcon />
                <AlertTitle>{t("feature.login.failed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </Field>
          )}
          <Field orientation="horizontal">
            <Button type="submit" disabled={loading}>
              {t("feature.login.signIn")}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
