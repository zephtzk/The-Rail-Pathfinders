const CACHE='commute-copilot-v1';
const SHELL=['/','/index.html','/multimodal.html','/replay.html','/icon.svg','/manifest.webmanifest','/src/rail-ui.js','/src/rail.css','/src/rail-engine.js','/src/multimodal-engine.js','/src/multimodal-ui.js','/src/pilot-validation.js','/src/journey-state.js','/src/journey-ui.js','/src/feed-health.js','/data/bus-network.json','/data/bus-manifest.json','/data/walking-links.json','/data/application-build.json','/data/rail-network.json','/data/rail-manifest.json','/src/app.js','/src/styles.css','/src/engine.js','/src/data.js','/src/storage.js','/src/live-data.js','/src/live-ui.js','/vendor/leaflet.js','/vendor/leaflet.css','/data/corridor.json','/data/sources.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('commute-copilot-')&&k!==CACHE).map(k=>caches.delete(k)))).then(stopJourneyNotifications).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
  if(event.data?.type!=='check-offline-readiness'||!event.ports?.[0])return;
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE),present=await Promise.all(SHELL.map(url=>cache.match(url).then(response=>!!response?.ok)));
      const ready=present.every(Boolean);
      event.ports[0].postMessage({type:'offline-readiness',ready,cache:CACHE,checkedAt:Date.now(),reason:ready?null:'Required offline assets are missing. Reconnect to refresh this app.'});
    }catch{event.ports[0].postMessage({type:'offline-readiness',ready:false,reason:'Browser cache is unavailable.'});}
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never intercept or prefetch OSM tiles; normal browser HTTP caching only.
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>await caches.match(url.pathname)||await caches.match('/')));return;}
  if(SHELL.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
// This build never displays journey push notifications, including late events
// queued for an older version. Subscription cleanup needs no bearer credential.
async function stopJourneyNotifications(){
  try{const subscription=await self.registration.pushManager?.getSubscription();if(subscription)await subscription.unsubscribe();}catch{}
  try{for(const notification of await self.registration.getNotifications({tag:'commute-journey-update'}))notification.close();}catch{}
}
self.addEventListener('push',event=>event.waitUntil(stopJourneyNotifications()));
self.addEventListener('notificationclick',event=>{event.notification.close();});
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil(stopJourneyNotifications()));
