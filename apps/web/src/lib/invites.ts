import { type InviteLink } from "@pantry/shared";

export const inviteUrl = (invite: InviteLink) =>
  new URL(`/invite/${invite.token}`, window.location.origin).href;
