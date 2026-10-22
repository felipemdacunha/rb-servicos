/*
 * Service worker do R&B Serviços.
 * - Telas e arquivos do app ficam guardados no celular: abre rápido e funciona sem internet.
 * - Dados (OS, ajustes): sempre busca na internet; sem sinal, mostra a última versão salva.
 * - Gravações (salvar, concluir, excluir) só com internet.
 */
const SHELL = "rb-shell-v1";
const ASSETS = "rb-assets-v1";
const DATA = "rb-data-v1";
const KEEP = [SHELL, ASSETS, DATA];
const STATIC_FILES = ["/", "/logo.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png", "/icons/favicon-64.png"];
/** Dados que podem ser vistos sem internet. */
const OFFLINE_API = /^\/api\/(orders|settings|cities|auth\/me)\b/;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(STATIC_FILES);
    // Guarda também os arquivos da página inicial (JS e CSS do build), para abrir sem internet já na primeira vez.
    const html = await (await shell.match("/"))?.text();
    const files = [...(html ?? "").matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
    if (files.length) await (await caches.open(ASSETS)).addAll(files);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  // Saiu da conta: apaga os dados guardados no aparelho.
  if (event.data === "logout") event.waitUntil(caches.delete(DATA));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Página do app: tenta a versão nova; sem internet, usa a guardada.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/"));
    return;
  }
  // Arquivos do build (nome muda a cada versão): do celular primeiro.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (OFFLINE_API.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  // Logo, ícones: mostra o guardado e atualiza em segundo plano.
  event.respondWith(staleWhileRevalidate(request, SHELL));
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallbackKey ?? request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) {
      // Avisa a tela que estes dados vieram do celular (sem internet).
      const headers = new Headers(cached.headers);
      headers.set("X-Offline", "1");
      return new Response(cached.body, { status: cached.status, headers });
    }
    if (request.mode === "navigate") return offlinePage();
    return new Response(JSON.stringify({ error: "Sem internet. Conecte-se para carregar estes dados." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache, 60);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached ?? update;
}

/** Arquivos de versões antigas: mantém só os mais recentes. */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

function offlinePage() {
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Sem internet</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#141518;color:#fff;font-family:system-ui;text-align:center;padding:24px">
    <div><p style="font-size:20px;font-weight:800">Sem internet</p><p style="color:#aaa">Conecte-se e tente de novo.</p>
    <button onclick="location.reload()" style="margin-top:12px;background:#e0342b;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:700;font-size:16px">Tentar novamente</button></div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
