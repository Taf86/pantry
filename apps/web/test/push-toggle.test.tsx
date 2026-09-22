import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn<(input: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);
const unsubscribe = vi.fn<(input: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);
const config = vi.fn<() => Promise<{ publicKey: string | null }>>(() =>
  Promise.resolve({ publicKey: PUBLIC_KEY }),
);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    push: {
      config: { query: () => config() },
      subscribe: { mutate: (input: unknown) => subscribe(input) },
      unsubscribe: { mutate: (input: unknown) => unsubscribe(input) },
    },
  },
}));

const PUBLIC_KEY =
  "BKJIARCdZNy56yT9a5t_tcmPl3hwclJTeIkDXyFtz3m4JFWDvf0M44rQVZAe-7bDvYPucKeZSUv6wkjXqA8JqAc";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

const PushToggle = (await import("@/features/admin/requests/push-toggle"))
  .default;

const requestPermission = vi.fn(() =>
  Promise.resolve<NotificationPermission>("granted"),
);
const pushSubscribe = vi.fn();
const getSubscription = vi.fn<() => Promise<PushSubscription | null>>(() =>
  Promise.resolve(null),
);
const subscriptionUnsubscribe = vi.fn(() => Promise.resolve(true));

const fakeSubscription = {
  endpoint: ENDPOINT,
  toJSON: () => ({
    endpoint: ENDPOINT,
    keys: { p256dh: "key", auth: "secret" },
  }),
  unsubscribe: subscriptionUnsubscribe,
} as unknown as PushSubscription;

const givenBrowser = (
  options: {
    permission?: NotificationPermission;
    pushManager?: boolean;
    existing?: PushSubscription | null;
  } = {},
) => {
  const permission = options.permission ?? "default";
  getSubscription.mockResolvedValue(options.existing ?? null);
  pushSubscribe.mockResolvedValue(fakeSubscription);

  window.Notification = { permission, requestPermission } as never;
  if (options.pushManager !== false) {
    window.PushManager = function PushManager() {} as never;
  }
  vi.stubGlobal("navigator", {
    userAgent: "test-agent",
    serviceWorker: {
      getRegistration: () =>
        Promise.resolve({
          pushManager: {
            getSubscription,
            subscribe: pushSubscribe,
          },
        }),
    },
  });
};

const renderToggle = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );

beforeEach(async () => {
  await import("@/lib/i18next");
  vi.clearAllMocks();
  config.mockResolvedValue({ publicKey: PUBLIC_KEY });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(window, "Notification");
});

describe("PushToggle", () => {
  it("never asks for permission on mount", async () => {
    givenBrowser();
    renderToggle(<PushToggle />);

    await screen.findByRole("button");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks, subscribes and registers, in that order, on a click", async () => {
    givenBrowser();
    renderToggle(<PushToggle />);

    await userEvent.click(await screen.findByRole("button"));

    await waitFor(() => {
      expect(subscribe).toHaveBeenCalled();
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(pushSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT }),
    );
  });

  it("stops at the browser's refusal without registering anything", async () => {
    givenBrowser();
    requestPermission.mockResolvedValue("denied");
    renderToggle(<PushToggle />);

    await userEvent.click(await screen.findByRole("button"));

    expect(pushSubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("explains a blocked origin instead of offering a button", async () => {
    givenBrowser({ permission: "denied" });
    renderToggle(<PushToggle />);

    expect(await screen.findByText(/bloccate|blocked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("tells an iOS tab to install the app first", async () => {
    givenBrowser({ pushManager: false });
    renderToggle(<PushToggle />);

    expect(
      await screen.findByText(/schermata home|home screen/i),
    ).toBeInTheDocument();
  });

  it("says so when the server has no keys configured", async () => {
    givenBrowser();
    config.mockResolvedValue({ publicKey: null });
    renderToggle(<PushToggle />);

    expect(
      await screen.findByText(/non sono configurate|not configured/i),
    ).toBeInTheDocument();
  });

  it("releases the device on both sides when turned off", async () => {
    givenBrowser({ permission: "granted", existing: fakeSubscription });
    renderToggle(<PushToggle />);

    const button = await screen.findByRole("button");
    await waitFor(() => {
      expect(button).toHaveTextContent(/disattiva|turn off/i);
    });

    await userEvent.click(button);

    await waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledWith({ endpoint: ENDPOINT });
    });
    expect(subscriptionUnsubscribe).toHaveBeenCalled();
  });

  it("renders nothing at all where push does not exist", () => {
    vi.stubGlobal("navigator", { userAgent: "test-agent" });
    const { container } = renderToggle(<PushToggle />);

    expect(container).toBeEmptyDOMElement();
  });
});
