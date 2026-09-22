const FALLBACK = {
  title: "Pantry",
  body: "Una richiesta è in attesa di approvazione.",
  url: "/admin/requests",
  tag: "pantry-requests",
};

self.addEventListener("push", (event) => {
  let data = FALLBACK;
  try {
    if (event.data) data = { ...FALLBACK, ...event.data.json() };
  } catch {
    //
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url ?? "/",
    self.location.origin,
  );

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (candidate) => new URL(candidate.url).origin === target.origin,
      );

      if (client) {
        await client.focus();
        client.postMessage({
          type: "pantry:navigate",
          url: target.pathname + target.search,
        });
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  console.warn("[pantry] push subscription changed", event.oldSubscription);
});
