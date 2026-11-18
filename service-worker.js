const SHELL_CACHE='iek-rasp-shell-v1';
const DATA_CACHE='iek-rasp-data-v1';
const SHELL=[
  './','./index.html','./app.js','./styles.css','./schedule-core.mjs',
  './manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png',
  './assets/icon-512.png','./data-model.mjs'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith('iek-rasp-')&&![SHELL_CACHE,DATA_CACHE].includes(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/data/schedule.json')){
    event.respondWith((async()=>{
      const cache=await caches.open(DATA_CACHE);
      try{
        const fresh=await fetch(request);
        if(!fresh.ok)throw new Error(`HTTP ${fresh.status}`);
        await cache.put(request,fresh.clone());
        return fresh;
      }catch(error){
        const saved=await cache.match(request);
        if(saved)return saved;
        throw error;
      }
    })());
    return;
  }
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    try{
      const fresh=await fetch(request);
      if(fresh.ok)await cache.put(request,fresh.clone());
      return fresh;
    }catch(error){
      const saved=await cache.match(request);
      if(saved)return saved;
      throw error;
    }
  })());
});
