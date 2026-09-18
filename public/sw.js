const CACHE='commute-copilot-v1';
const SHELL=['/','/index.html','/multimodal.html','/replay.html','/icon.svg','/manifest.webmanifest','/src/rail-ui.js','/src/rail.css','/src/rail-engine.js','/src/multimodal-engine.js','/src/multimodal-ui.js','/src/pilot-validation.js','/data/bus-network.json','/data/bus-manifest.json','/data/walking-links.json','/data/application-build.json','/data/rail-network.json','/data/rail-manifest.json','/src/app.js','/src/styles.css','/src/engine.js','/src/data.js','/src/storage.js','/src/live-data.js','/src/live-ui.js','/vendor/leaflet.js','/vendor/leaflet.css','/data/corridor.json','/data/sources.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('commute-copilot-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never intercept or prefetch OSM tiles; normal browser HTTP caching only.
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>await caches.match(url.pathname)||await caches.match('/')));return;}
  if(SHELL.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
