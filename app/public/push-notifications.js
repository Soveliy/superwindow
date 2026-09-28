/* global self, clients */

const getPushPayload = (event) => {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
};

const getSafeTargetUrl = (value) => {
  const scopeUrl = new URL(self.registration.scope);
  const defaultTarget = new URL('notifications', scopeUrl).href;

  if (typeof value !== 'string' || !value.trim()) {
    return defaultTarget;
  }

  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(value)
      ? new URL(value)
      : new URL(value.replace(/^\/+/, ''), scopeUrl);

    return candidate.origin === scopeUrl.origin && candidate.href.startsWith(scopeUrl.href)
      ? candidate.href
      : defaultTarget;
  } catch {
    return defaultTarget;
  }
};

self.addEventListener('push', (event) => {
  const payload = getPushPayload(event);
  const title = typeof payload.title === 'string' ? payload.title : 'SuperWindow';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'В кабинете дилера новое событие.',
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
    ...(typeof payload.tag === 'string' && payload.tag.trim() ? { tag: payload.tag } : {}),
    renotify: Boolean(payload.renotify),
    data: {
      url: getSafeTargetUrl(payload.url),
      ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = getSafeTargetUrl(event.notification.data?.url);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const matchingClient = windowClients.find((client) => client.url === targetUrl);

      if (matchingClient) {
        return matchingClient.focus();
      }

      const scopedClient = windowClients.find((client) => client.url.startsWith(self.registration.scope));

      if (scopedClient) {
        return scopedClient.navigate(targetUrl).then(() => scopedClient.focus());
      }

      return clients.openWindow(targetUrl);
    }),
  );
});
