import { RequestStatus, RequestType } from "@pantry/shared";

export const requestTypeLabelKeys = {
  [RequestType.signup]: "feature.requests.type.signup",
  [RequestType.reset_password]: "feature.requests.type.resetPassword",
} as const;

export const requestStatusLabelKeys = {
  [RequestStatus.pending]: "feature.requests.status.pending",
  [RequestStatus.approved]: "feature.requests.status.approved",
  [RequestStatus.rejected]: "feature.requests.status.rejected",
} as const;

/** What the public form says, which is all that separates the two routes. */
export const requestFormKeys = {
  [RequestType.signup]: {
    title: "feature.request.signup.title",
    description: "feature.request.signup.description",
    done: "feature.request.signup.done",
  },
  [RequestType.reset_password]: {
    title: "feature.request.reset.title",
    description: "feature.request.reset.description",
    done: "feature.request.reset.done",
  },
} as const;
