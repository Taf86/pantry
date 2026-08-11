import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetNotices } from "../src/lib/notify";

afterEach(() => {
  cleanup();
  resetNotices();
  vi.clearAllMocks();
});

// jsdom non implementa `matchMedia`, che React Router e alcuni componenti
// interrogano durante il primo render.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
