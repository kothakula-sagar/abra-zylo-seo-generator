const CACHE='abra-zylo-demo-v1';
const CORE=['./','./index.html','./styles.css','./app.js','./store.js','./assets/tee.webp','./assets/care.webp','./assets/tote.webp','./assets/shirt.webp','./assets/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('abra-zylo-demo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||new Response('Demo is offline. Open a previously visited page.',{status:503}))));});
