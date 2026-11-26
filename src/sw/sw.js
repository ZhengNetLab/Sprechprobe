// Service worker: makes the app work offline (spec §8).
//
// Two caches:
//   sprechprobe-app-<version>  the app itself (code, styles, icons). The build
//                              (vite.config.ts) fills in VERSION and FILES.
//                              A new deploy installs a new one and the old one
//                              is deleted.
//   sprechprobe-content        project audio. The app fills it when a project
//                              is added or synced (src/content.ts); this
//                              worker only reads from it and never deletes it.
// Project data (catalog, scenes) is stored by the app in IndexedDB, so the
// worker lets those requests go to the network.

const VERSION = '__VERSION__';
const FILES = __FILES__;
const APP_CACHE = `sprechprobe-app-${VERSION}`;
const CONTENT_CACHE = 'sprechprobe-content';

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(FILES.map(scopeUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('sprechprobe-') && k !== APP_CACHE && k !== CONTENT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Safari asks for audio in byte ranges and won't play a plain 200 reply,
// so cut the cached file into the 206 response it expects.
async function rangeResponse(request, response) {
  const buffer = await response.arrayBuffer();
  const match = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  const size = buffer.byteLength;
  let start = match && match[1] ? Number(match[1]) : 0;
  let end = match && match[2] ? Number(match[2]) : size - 1;
  if (match && !match[1] && match[2]) {
    // "bytes=-500": the last 500 bytes
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

async function fromCache(cacheName, request, key) {
  const cache = await caches.open(cacheName);
  // ignoreVary: module scripts are requested with an Origin header the
  // precache requests lacked, so a "Vary: Origin" reply would never match.
  const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate', ignoreVary: true });
  if (!cached) return fetch(request);
  return request.headers.has('range') ? rangeResponse(request, cached) : cached;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.href.slice(self.registration.scope.length);

  if (path.startsWith('content/audio/')) {
    event.respondWith(fromCache(CONTENT_CACHE, request, url.href));
  } else if (path.startsWith('content/')) {
    return; // catalog and project data: always from the network
  } else {
    // The app has a single page; routes live in the URL hash.
    const key = request.mode === 'navigate' ? scopeUrl('./') : request;
    event.respondWith(fromCache(APP_CACHE, request, key));
  }
});
