// Service worker de Dineros Dineros.
//
// Lo único que hace es guardar los archivos de la propia app para que abra sin
// señal. No manda nada, no recibe nada, no pregunta por versiones nuevas.
//
// Regla dura: solo responde peticiones del MISMO origen (los archivos de la app).
// Cualquier cosa de otro dominio no se toca — no hay ninguna, y si algún día se
// colara una, aquí se ve.

const CACHE = 'dineros-dineros-v6';

const ARCHIVOS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './versiculos.js',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png'
];

// Ojo con esto: `addAll` a secas pide los archivos PASANDO POR EL CACHE del
// navegador, así que el cache nuevo se llenaba con los archivos viejos y subir
// el número de versión no servía de nada. Era el bug del "ábrela dos veces".
// `cache: 'reload'` obliga a traerlos de la red.
self.addEventListener('install', (e) => {
  const frescos = ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(frescos)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // nada de otros dominios

  e.respondWith(
    caches.match(e.request).then((guardado) => {
      if (guardado) return guardado;
      return fetch(e.request).then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
