// Yūgen Bonsaï — service worker
// Stratégie :
//  - index.html (le coeur de l'app) : "network-first" -> toujours la dernière
//    version en ligne ; le cache ne sert que de secours hors-ligne.
//    Ça évite le problème historique de cache figé (plus besoin de
//    Ctrl+Shift+R pour voir tes changements).
//  - manifest + icônes + polices : "cache-first" -> ça ne change presque
//    jamais, donc autant servir depuis le cache et ne pas refaire de requête.
//
// Les données (collection, photos) restent dans localStorage/IndexedDB,
// ce service worker ne touche à rien de tout ça.

const CACHE_NAME = 'yugen-bonsai-shell-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne gère que le GET (pas les requêtes vers l'API GitHub/Gist en POST/PATCH)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // CRUCIAL : on ne touche jamais aux requêtes vers un autre domaine
  // (api.github.com pour la sync Gist, Google Fonts, etc.) — on les laisse
  // filer directement au réseau sans passer par le cache du service worker.
  if (!isSameOrigin) return;

  const isNavigation = req.mode === 'navigate';
  const isAppShellDoc = isNavigation || url.pathname.endsWith('index.html');

  if (isAppShellDoc) {
    // Network-first : toujours essayer d'avoir la dernière version en ligne
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./'))
        )
    );
    return;
  }

  // Tout le reste (icônes, manifest, polices Google, etc.) : cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req, { mode: req.mode === 'navigate' ? 'same-origin' : req.mode })
        .then((res) => {
          // On évite de mettre en cache les réponses d'erreur
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
