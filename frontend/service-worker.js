// ============================================================================
//  Service Worker — PWA 오프라인 캐싱 + Web Push 수신
// ============================================================================
const CACHE_VERSION = "v1.1.0";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// 앱 셸 (오프라인 우선 캐싱 대상)
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/css/styles.css",
  "/js/config.js",
  "/js/app.js",
  "/js/ui.js",
  "/js/auth.js",
  "/js/store.js",
  "/js/supabaseClient.js",
  "/js/dashboard.js",
  "/js/detail.js",
  "/js/calendar.js",
  "/js/faq.js",
  "/js/neis.js",
  "/js/notifications.js",
  "/js/pwa.js",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
];

// --- 설치: 앱 셸 캐싱 ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // 일부 자원 실패해도 설치는 진행
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// --- 활성화: 옛 캐시 제거 ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- fetch 전략 ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API / Supabase 요청은 항상 네트워크 (캐시하지 않음)
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/service-worker.js")
  ) {
    return; // 브라우저 기본 처리
  }

  // 페이지 내비게이션: 네트워크 우선 → 실패 시 캐시 → 오프라인 폴백
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // 정적 자원 / CDN: 캐시 우선 → 네트워크(stale-while-revalidate)
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && (url.origin === self.location.origin || res.type === "cors")) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// --- Web Push 수신 ---
self.addEventListener("push", (event) => {
  let data = { title: "8반 스케줄러", body: "새 알림이 있습니다." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    vibrate: [80, 40, 80],
    data: { url: data.url || "/" },
    tag: data.tag || "class8",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// --- 알림 클릭 ---
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ("focus" in win) {
          win.focus();
          win.postMessage({ type: "navigate", url: target });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow("/" + (target.startsWith("#") ? target : ""));
    })
  );
});

// 즉시 활성화 메시지
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
