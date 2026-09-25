/**
 * The device clock, made fit to write with.
 *
 * Under group last-write-wins the comparison IS the conflict resolution, so a
 * phone whose clock runs ten minutes fast would win every race forever, and
 * one running ten minutes slow could never edit anything while being told
 * "saved" each time.
 */

/**
 * A stamp that always beats the row it was made against.
 *
 * Bounding the damage to genuinely concurrent edits: whatever the device
 * clock says, an edit you just made to a row you are looking at will land.
 * Without this, a slow clock is a silently read-only client.
 */
export const contentStamp = (previous?: string | null): string => {
  const floor =
    previous === null || previous === undefined ? 0 : Date.parse(previous) + 1;
  const safeFloor = Number.isNaN(floor) ? 0 : floor;
  return new Date(Math.max(Date.now(), safeFloor)).toISOString();
};

/**
 * The offset between this device and the server, learned from any write.
 *
 * Every write result carries `serverTime`; clamping only rescues a device that
 * is ahead, so a device that is behind needs to correct itself, and this is
 * what it corrects by.
 */
let offsetMs = 0;

export const recordServerTime = (serverTime: string): void => {
  const server = Date.parse(serverTime);
  if (!Number.isNaN(server)) offsetMs = server - Date.now();
};

/** Device time corrected by the last known server offset. */
export const now = (): number => Date.now() + offsetMs;

export const nowIso = (): string => new Date(now()).toISOString();

/** Test seam: the offset is module state, like the server's own clock. */
export const resetClockOffset = (): void => {
  offsetMs = 0;
};
