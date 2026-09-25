import type { Location } from "react-router-dom";

/**
 * What one guard stashes so the other can send you back where you meant to go.
 *
 * React Router types navigation state as `any`, so producer and consumer would
 * otherwise agree only by convention — and the reader is the one place a typo
 * shows up as a silent redirect to the wrong page.
 */
export interface RedirectState {
  from: Pick<Location, "pathname">;
}

export const redirectState = (location: Location): RedirectState => ({
  from: location,
});

/** The path that was asked for, or the fallback if there was not one. */
export const intendedPath = (state: unknown, fallback: string): string => {
  const from = (state as RedirectState | null | undefined)?.from;
  return typeof from?.pathname === "string" ? from.pathname : fallback;
};
