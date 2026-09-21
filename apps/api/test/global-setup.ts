import { assertReachable } from "./helpers/harness.js";

export const setup = async (): Promise<void> => {
  await assertReachable();
};
