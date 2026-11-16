// sw.js — 서비스워커 (앱 셸 오프라인 + 홈 화면 설치)
// 전략: /api 는 캐시하지 않고 항상 네트워크(실시간 Notion).
//       나머지 정적 파일은 "네트워크 우선 + 캐시 폴백" 으로, 배포 즉시 최신 앱이 반영되게 함.
const CACHE = 'healthy9-v2';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  // API·비 GET·외부 출처는 서비스워커가 건드리지 않음(그대로 네트워크)
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;

  // 네트워크 우선 → 실패 시 캐시 폴백
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
