import { ROLE_NAMES } from "@pantry/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { roleLabelKeys } from "./role-labels";

/** Not a role: a mask that matches none of them, set outside this screen. */
export const CUSTOM = "custom";

export default function useRoleItems() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      ...Object.fromEntries(
        ROLE_NAMES.map((name) => [name, t(roleLabelKeys[name])]),
      ),
      [CUSTOM]: t("feature.lists.role.custom"),
    }),
    [t],
  );
}
