const CACHE = 'forge-shell-v3';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/monaco/vs/loader.js', '/monaco/vs/editor/editor.main.js', '/monaco/vs/editor/editor.main.css', '/monaco/vs/base/worker/workerMain.js', '/monaco/vs/base/browser/ui/codicons/codicon/codicon.ttf'];
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(value => {
    try { const url = new URL(value, self.location.origin); return url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/monaco/')); } catch { return false; }
  });
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all([...new Set(urls)].map(url => cache.add(url).catch(() => {})))));
});
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const page = await cache.match('/');
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => new URL(match[1].replaceAll('&amp;', '&'), self.location.origin)).filter(url => url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/monaco/'))).map(url => url.href);
    await Promise.all([...new Set(assets)].map(url => cache.add(url).catch(() => {})));
    for (const url of assets.filter(url => new URL(url).pathname.endsWith('.css'))) {
      const response = await cache.match(url);
      if (!response) continue;
      const css = await response.text();
      const fonts = [...css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1].replace(/^['"]|['"]$/g, '')).filter(path => !path.startsWith('data:')).map(path => new URL(path, url)).filter(url => url.origin === self.location.origin);
      for (const font of fonts) await cache.add(font.href).catch(() => {});
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('forge-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put('/', copy))); }
      return response;
    }).catch(() => caches.match('/').then(response => response || new Response('Forge is offline. Start your local workspace server, then reload.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/monaco/') || /\.(?:js|css|woff2?|png|svg)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy))); }
      return response;
    })));
  }
});
