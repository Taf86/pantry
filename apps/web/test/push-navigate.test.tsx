import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import RootLayout from "@/components/layout/root-layout";
import { PUSH_NAVIGATE_MESSAGE } from "@/lib/push";

describe("root layout: navigation from the service worker", () => {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();

  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal("navigator", {
      userAgent: "test-agent",
      serviceWorker: {
        addEventListener: (
          _type: string,
          fn: (event: MessageEvent<unknown>) => void,
        ) => listeners.add(fn),
        removeEventListener: (
          _type: string,
          fn: (event: MessageEvent<unknown>) => void,
        ) => listeners.delete(fn),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderAt = (path: string) => {
    const router = createMemoryRouter(
      [
        {
          element: <RootLayout />,
          children: [
            { path: "/", element: <p>home</p> },
            { path: "/admin/requests", element: <p>requests</p> },
          ],
        },
      ],
      { initialEntries: [path] },
    );
    render(<RouterProvider router={router} />);
  };

  const post = (data: unknown) => {
    for (const listener of listeners) {
      listener(new MessageEvent("message", { data }));
    }
  };

  it("routes to the url the worker sent", async () => {
    renderAt("/");
    expect(screen.getByText("home")).toBeInTheDocument();

    post({ type: PUSH_NAVIGATE_MESSAGE, url: "/admin/requests" });

    await waitFor(() => {
      expect(screen.getByText("requests")).toBeInTheDocument();
    });
  });

  it("ignores messages that are not its own", async () => {
    renderAt("/");

    post({ type: "something-else", url: "/admin/requests" });
    post({ type: PUSH_NAVIGATE_MESSAGE });
    post("a bare string");

    await waitFor(() => {
      expect(screen.getByText("home")).toBeInTheDocument();
    });
  });
});
