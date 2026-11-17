/* Деканат будущего — service worker.
   Кеширует только статическую оболочку (иконки, CSS, JS).
   API-запросы всегда идут в сеть: данные кабинета кешировать нельзя,
   чтобы студент не видел устаревшие или чужие данные. */
'use strict';

const VERSION = 'dekanat-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API — только сеть, без кеша
  if (url.pathname.startsWith('/api/')) return;

  // Только GET и только наш origin
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Статика: сначала сеть (свежая версия), при офлайне — кеш
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Офлайн и ничего нет в кеше — для навигации отдаём оболочку
        if (event.request.mode === 'navigate') return caches.match('/index.html');
        return new Response('Офлайн', { status: 503 });
      })
  );
});
