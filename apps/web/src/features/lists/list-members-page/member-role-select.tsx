import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppMutation } from "@/hooks/use-app-mutation";
import { MUTATION } from "@/lib/mutations";
import {
  ROLE_NAMES,
  Role,
  roleOf,
  uuidv7,
  type ListMember,
  type RoleName,
  type SetMemberInput,
} from "@pantry/shared";
import { useTranslation } from "react-i18next";
import { roleLabelKeys } from "../common/role-labels";
import useRoleItems, { CUSTOM } from "../common/use-role-items";

type RoleChoice = RoleName | typeof CUSTOM;

export default function MemberRoleSelect({
  listId,
  member,
  disabled,
}: {
  listId: string;
  member: ListMember;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const roleItems = useRoleItems();

  const set = useAppMutation<SetMemberInput, ListMember[]>(
    MUTATION.listMemberSet,
  );

  const choice: RoleChoice = roleOf(member.permissions) ?? CUSTOM;

  const changeRole = (next: unknown) => {
    if (typeof next !== "string" || next === CUSTOM || next === choice) return;
    set.mutate({
      mutationId: uuidv7(),
      listId,
      userId: member.userId,
      permissions: Role[next as RoleName],
    });
  };

  return (
    <Select
      items={roleItems}
      value={choice}
      onValueChange={changeRole}
      disabled={disabled || set.isPending}
    >
      <SelectTrigger
        size="sm"
        className="w-32"
        aria-label={t("feature.lists.members.roleOf", {
          displayName: member.userDisplayName,
        })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_NAMES.map((name) => (
          <SelectItem key={name} value={name}>
            {t(roleLabelKeys[name])}
          </SelectItem>
        ))}
        {choice === CUSTOM && (
          <SelectItem value={CUSTOM} disabled>
            {t("feature.lists.role.custom")}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
