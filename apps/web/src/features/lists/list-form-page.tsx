import ErrorPage from "@/components/errors/error-page";
import { FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAppMutation } from "@/hooks/use-app-mutation";
import { MUTATION } from "@/lib/mutations";
import { requiredString } from "@/lib/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_NAME_LENGTH,
  Permission,
  can,
  uuidv7,
  type CreateListInput,
  type UpdateListInput,
} from "@pantry/shared";
import { useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import * as z from "zod";
import { useLists } from "./use-lists";

const listsPath = "/lists";
export default function ListFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { listId } = useParams<{ listId: string }>();
  const editing = listId !== undefined;

  const [newId] = useState(() => uuidv7());
  const id = listId ?? newId;

  const lists = useLists();
  const list = lists.data?.find((candidate) => candidate.id === id);

  const create = useAppMutation<CreateListInput>(MUTATION.listCreate, {
    listId: id,
  });
  const update = useAppMutation<UpdateListInput>(MUTATION.listUpdate, {
    listId: id,
  });

  const formSchema = z.object({
    name: requiredString(t).max(MAX_NAME_LENGTH),
  });
  type Values = z.infer<typeof formSchema>;

  const loaded = useMemo<Values | undefined>(
    () => (editing && list ? { name: list.name } : undefined),
    [editing, list],
  );

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
    ...(loaded && { values: loaded }),
  });

  const onValid: SubmitHandler<Values, unknown> = (data, event) => {
    event?.preventDefault();
    const mutationId = uuidv7();
    if (editing) {
      update.mutate({ mutationId, listId: id, name: data.name });
    } else {
      create.mutate({ mutationId, id, name: data.name });
    }
    void navigate(listsPath);
  };

  if (editing && lists.isPending) return <Loader />;
  if (editing && !list) {
    return (
      <ErrorPage
        title={t("feature.lists.form.notFoundTitle")}
        description={t("feature.lists.form.notFound")}
      />
    );
  }
  if (editing && list && !can(list.permissions, Permission.Write)) {
    return (
      <ErrorPage
        title={t("feature.lists.form.forbiddenTitle")}
        description={t("feature.lists.form.forbidden")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-medium">
        {t(
          editing
            ? "feature.lists.form.editTitle"
            : "feature.lists.form.createTitle",
        )}
      </h1>

      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet className="max-w-md">
            <FieldDescription>
              {t(
                editing
                  ? "feature.lists.form.editDescription"
                  : "feature.lists.form.createDescription",
              )}
            </FieldDescription>
            <FieldGroup>
              <FormField
                name="name"
                control={form.control}
                label={t("feature.lists.form.name")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    autoComplete="off"
                    autoFocus
                  />
                )}
              </FormField>
            </FieldGroup>

            <Field orientation="horizontal">
              <Button type="submit">
                {t(
                  editing
                    ? "feature.lists.form.save"
                    : "feature.lists.form.create",
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void navigate(listsPath)}
              >
                {t("feature.lists.form.cancel")}
              </Button>
            </Field>
          </FieldSet>
        </FieldGroup>
      </form>
    </div>
  );
}
