import { afterEach, describe, expect, it, vi } from "vitest";

import {
  notificationPermission,
  pushSupport,
  toSubscribeInput,
  urlBase64ToUint8Array,
} from "@/lib/push";

const PUBLIC_KEY =
  "BKJIARCdZNy56yT9a5t_tcmPl3hwclJTeIkDXyFtz3m4JFWDvf0M44rQVZAe-7bDvYPucKeZSUv6wkjXqA8JqAc";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(window, "Notification");
});

describe("urlBase64ToUint8Array", () => {
  it("decodes an application server key to its 65 raw bytes", () => {
    const bytes = urlBase64ToUint8Array(PUBLIC_KEY);

    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("restores the padding base64url leaves off", () => {
    expect(urlBase64ToUint8Array("QQ")).toEqual(new Uint8Array([0x41]));
    expect(urlBase64ToUint8Array("QUI")).toEqual(new Uint8Array([0x41, 0x42]));
    expect(urlBase64ToUint8Array("QUJD")).toEqual(
      new Uint8Array([0x41, 0x42, 0x43]),
    );
  });

  it("translates the two substituted characters", () => {
    expect(urlBase64ToUint8Array("-_8")).toEqual(new Uint8Array([0xfb, 0xff]));
  });
});

describe("pushSupport", () => {
  const withNavigator = (value: object) => {
    vi.stubGlobal("navigator", value);
  };

  it("is unsupported without a service worker", () => {
    withNavigator({});
    expect(pushSupport()).toBe("unsupported");
  });

  it("asks for an install when Notification exists but PushManager does not", () => {
    withNavigator({ serviceWorker: {} });
    vi.stubGlobal("Notification", { permission: "default" });
    window.Notification = { permission: "default" } as never;

    expect(pushSupport()).toBe("install-first");
  });

  it("is supported when both exist", () => {
    withNavigator({ serviceWorker: {} });
    window.Notification = { permission: "default" } as never;
    window.PushManager = function PushManager() {} as never;

    expect(pushSupport()).toBe("supported");
  });
});

describe("notificationPermission", () => {
  it("reports denied when the API is missing, rather than throwing", () => {
    expect(notificationPermission()).toBe("denied");
  });

  it("reads the browser's own answer", () => {
    window.Notification = { permission: "granted" } as never;
    expect(notificationPermission()).toBe("granted");
  });
});

describe("toSubscribeInput", () => {
  const subscription = (json: unknown) =>
    ({ toJSON: () => json }) as PushSubscription;

  it("reshapes what the browser hands over", () => {
    const input = toSubscribeInput(
      subscription({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "key", auth: "secret" },
      }),
    );

    expect(input.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(input.keys).toEqual({ p256dh: "key", auth: "secret" });
  });

  it("refuses a subscription missing its keys", () => {
    expect(() =>
      toSubscribeInput(subscription({ endpoint: "https://example.com" })),
    ).toThrow(/incomplete/i);
  });
});
