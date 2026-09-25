/**
 * Device clocks, made safe to compare.
 *
 * Last-write-wins pivots on the instant the writing device recorded, not the
 * instant the write arrived: a tick made in the shop at 18:03 and synced at
 * 18:40 must not beat an untick made at home at 18:20. That only works if the
 * device clock can be trusted a little, and it cannot be trusted much.
 */

/**
 * A device clock running fast would otherwise stamp a far-future instant that
 * no later write could ever beat, freezing the row for everyone.
 */
export const clampToNow = (at: Date, now: Date = new Date()): Date =>
  at.getTime() > now.getTime() ? now : at;

/**
 * Clamping rescues a device that is ahead. One that is BEHIND has every write
 * discarded as stale instead, silently, because by design there is no conflict
 * to report. That is why every write result carries the server time back: the
 * client measures its own offset and corrects the next stamp itself.
 */
export const serverTimeOf = (now: Date): string => now.toISOString();
