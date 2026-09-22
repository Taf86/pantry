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

const PushToggle = (await import("@/components/layout/push-toggle")).default;
const { Toaster } = await import("@/components/ui/toast");

const requestPermission = vi.fn<() => Promise<NotificationPermission>>();
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
    prompt?: NotificationPermission;
    pushManager?: boolean;
    serviceWorker?: boolean;
    existing?: PushSubscription | null;
  } = {},
) => {
  const permission = options.permission ?? "default";
  requestPermission.mockResolvedValue(options.prompt ?? "granted");
  getSubscription.mockResolvedValue(options.existing ?? null);
  pushSubscribe.mockImplementation(() => {
    getSubscription.mockResolvedValue(fakeSubscription);
    return Promise.resolve(fakeSubscription);
  });
  subscriptionUnsubscribe.mockImplementation(() => {
    getSubscription.mockResolvedValue(null);
    return Promise.resolve(true);
  });

  window.Notification = { permission, requestPermission } as never;
  if (options.pushManager !== false) {
    window.PushManager = function PushManager() {} as never;
  }
  vi.stubGlobal("navigator", {
    userAgent: "test-agent",
    ...(options.serviceWorker === false
      ? {}
      : {
          serviceWorker: {
            getRegistration: () =>
              Promise.resolve({
                pushManager: { getSubscription, subscribe: pushSubscribe },
              }),
          },
        }),
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
      <Toaster />
    </QueryClientProvider>,
  );

const bell = () => screen.findByRole("button", { name: /notif/i });

const settledBell = async () => {
  const button = await bell();
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  return button;
};

const pressAndRead = async (): Promise<string> => {
  await userEvent.click(await settledBell());
  const toast = await screen.findByRole("dialog");
  return toast.textContent ?? "";
};

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

    await screen.findByRole("button", { name: /notif/i });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("shows one control, labelled Notifiche", async () => {
    givenBrowser();
    renderToggle(<PushToggle />);

    const buttons = await screen.findAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(/notifiche|notifications/i);
  });

  it("reports its state through aria-pressed, not just the icon", async () => {
    givenBrowser();
    renderToggle(<PushToggle />);

    const button = await settledBell();
    expect(button).toHaveAttribute("aria-pressed", "false");

    await pressAndRead();

    await waitFor(() => {
      expect(button).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("claims nothing until it knows, and cannot be pressed meanwhile", async () => {
    let resolveConfig: (value: { publicKey: string | null }) => void = () =>
      undefined;
    config.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    givenBrowser({ permission: "granted", existing: fakeSubscription });
    renderToggle(<PushToggle />);

    const button = await bell();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    resolveConfig({ publicKey: PUBLIC_KEY });

    await waitFor(() => {
      expect(button).toHaveAttribute("aria-pressed", "true");
    });
    expect(button).toBeEnabled();
  });

  it("asks, subscribes, registers and says so", async () => {
    givenBrowser();
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(/attive|on for this device/i);

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(pushSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT }),
    );
  });

  it("releases the device on both sides and says so", async () => {
    givenBrowser({ permission: "granted", existing: fakeSubscription });
    renderToggle(<PushToggle />);

    await waitFor(() => {
      expect(subscribe).toHaveBeenCalled();
    });

    expect(await pressAndRead()).toMatch(/disattivate|off for this device/i);

    expect(unsubscribe).toHaveBeenCalledWith({ endpoint: ENDPOINT });
    expect(subscriptionUnsubscribe).toHaveBeenCalled();
  });

  it("reports a refusal without registering anything", async () => {
    givenBrowser({ prompt: "denied" });
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(/bloccate|blocked/i);

    expect(pushSubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("does not re-prompt an origin that is already blocked", async () => {
    givenBrowser({ permission: "denied" });
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(/bloccate|blocked/i);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("says when the server has no keys configured", async () => {
    givenBrowser();
    config.mockResolvedValue({ publicKey: null });
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(
      /non sono configurate|not configured/i,
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("tells an iOS tab to install the app first", async () => {
    givenBrowser({ pushManager: false });
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(/schermata home|home screen/i);
  });

  it("reports a failure instead of pretending it worked", async () => {
    givenBrowser();
    pushSubscribe.mockRejectedValue(new Error("no registration"));
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(/riprova|try again/i);
  });

  it("renders nothing at all where push does not exist", () => {
    givenBrowser({ serviceWorker: false });
    const { container } = renderToggle(<PushToggle />);

    expect(screen.queryByRole("button", { name: /notif/i })).toBeNull();
    expect(container).not.toHaveTextContent(/notifiche/i);
  });

  it("distinguishes an unreachable server from one without keys", async () => {
    givenBrowser();
    config.mockRejectedValue(new Error("offline"));
    renderToggle(<PushToggle />);

    expect(await pressAndRead()).toMatch(/riprova|try again/i);
  });
});
