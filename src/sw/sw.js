// Service worker: makes the app work offline (spec §8).
//
// The build (vite.config.ts) replaces __VERSION__ and __FILES__ with the
// build's hash and the list of every file in dist/, then writes this as
// dist/sw.js. On install it caches all of them (code, icons, every mp3);
// every request is then served from that cache. A new deploy has a new
// version: it caches the new files, takes over, and deletes the old cache.
// The new version shows on the next launch.

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `sprechprobe-${VERSION}`;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map(scopeUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sprechprobe-') && k !== CACHE).map((k) => caches.delete(k))))
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

async function respond(request) {
  const cache = await caches.open(CACHE);
  // The app has a single page; routes live in the URL hash.
  const key = request.mode === 'navigate' ? scopeUrl('./') : request;
  // ignoreVary: module scripts are requested with an Origin header the
  // precache requests lacked, so a "Vary: Origin" reply would never match.
  const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate', ignoreVary: true });
  if (cached) return request.headers.has('range') ? rangeResponse(request, cached) : cached;
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
