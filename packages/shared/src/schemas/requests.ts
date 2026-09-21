import z from "zod";
import {
  DEFAULT_PAGINATION,
  emailSchema,
  nameSchema,
  paginationSchema,
  type Page,
} from "./common.js";
import type { UserExtended, UserRef } from "./users.js";
import type { InviteLink } from "./invites.js";
import { MAX_CONTACT_LENGTH, MAX_NOTE_LENGTH } from "../constants.js";

export const RequestType = {
  signup: "signup",
  reset_password: "reset_password",
} as const;
export type RequestType = (typeof RequestType)[keyof typeof RequestType];
export const RequestTypes = [
  RequestType.signup,
  RequestType.reset_password,
] as const;
export const requestTypeSchema = z.enum(RequestType);

export const RequestStatus = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];
export const RequestStatuses = [
  RequestStatus.pending,
  RequestStatus.approved,
  RequestStatus.rejected,
] as const;
export const requestStatusSchema = z.enum(RequestStatus);

export const noteSchema = z.string().trim().max(MAX_NOTE_LENGTH);

export type RequestExtended = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  email: string;
  displayName: string | null;
  note: string | null;
  user: UserRef | null;
  decidedBy: UserRef | null;
  decidedAt: string | null;
  createdAt: string;
};

export const createRequestInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(RequestType.signup),
    email: emailSchema,
    displayName: nameSchema,
    note: noteSchema.optional(),
  }),
  z.object({
    type: z.literal(RequestType.reset_password),
    email: emailSchema,
    note: noteSchema.optional(),
  }),
]);
export type CreateRequestInput = z.infer<typeof createRequestInputSchema>;

export const RequestSortFields = [
  "email",
  "type",
  "status",
  "createdAt",
] as const;
export type RequestSortField = (typeof RequestSortFields)[number];
export const requestSortFieldSchema = z.enum(RequestSortFields);

export const requestSortSchema = z.object({
  id: requestSortFieldSchema,
  desc: z.boolean(),
});
export type RequestSort = z.infer<typeof requestSortSchema>;

export const listRequestsFiltersSchema = z.object({
  email: z.string().trim().min(1).max(MAX_CONTACT_LENGTH).optional(),
  type: z.array(requestTypeSchema).min(1).max(RequestTypes.length).optional(),
  status: z
    .array(requestStatusSchema)
    .min(1)
    .max(RequestStatuses.length)
    .optional(),
});
export type ListRequestsFilters = z.infer<typeof listRequestsFiltersSchema>;

export const listRequestsInputSchema = z.object({
  pagination: paginationSchema.default(DEFAULT_PAGINATION),
  sorting: z.array(requestSortSchema).max(RequestSortFields.length).default([]),
  filters: listRequestsFiltersSchema.default({}),
});
export type ListRequestsInput = z.infer<typeof listRequestsInputSchema>;
export type ListRequestsResult = Page<RequestExtended>;

export const requestIdInputSchema = z.object({
  requestId: z.uuid(),
});
export type RequestIdInput = z.infer<typeof requestIdInputSchema>;

export type ApproveRequestResult = {
  request: RequestExtended;
  user: UserExtended;
  invite: InviteLink;
};
