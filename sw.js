const CACHE = 'beardash-shell-v23';
const FILES = ['./','./index.html','./style.css','./app.js','./delivery.js','./push.js','./manifest.webmanifest','./beardash-wordmark.png','./beardash-icon.png','./beardash-hero.png','./beardash-mascot.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES).then(()=>self.skipWaiting()))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('beardash-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request,copy))); } return response; }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match('./index.html') : Response.error())));
});
// Push preferences live outside the versioned shell cache so app updates preserve opt-in.
async function pushEnabled(){
 try{const cache=await caches.open('beardash-push-settings-v1');const entry=await cache.match(new URL('.beardash-push-state',self.registration.scope).href);return entry?(await entry.json()).enabled===true:false;}catch{return false;}
}
function safePushUrl(value){
 try{const base=new URL(self.registration.scope),url=new URL(value||'./',base);if(url.origin===base.origin&&url.pathname===base.pathname)return url.href;}catch{}
 return self.registration.scope;
}
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  if(!await pushEnabled())return;
  let data={};try{data=event.data?.json()||{};}catch{}
  await self.registration.showNotification(String(data.title||'BearDash update').slice(0,100),{
   body:String(data.body||'Open BearDash to check your dashboard.').slice(0,300),
   icon:new URL('beardash-icon.png',self.registration.scope).href,
   badge:new URL('beardash-icon.png',self.registration.scope).href,
   tag:'beardash-'+String(data.event_id||'update').slice(0,80),
   data:{url:safePushUrl(data.url)}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=safePushUrl(event.notification.data?.url);
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>{try{return new URL(client.url).origin===new URL(self.registration.scope).origin&&new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname);}catch{return false;}});
  if(existing){existing.postMessage({type:'BEARDASH_PUSH_OPEN',url});await existing.focus();}
  else await self.clients.openWindow(url);
 })());
});

self.addEventListener('message',event=>{if(event.data?.type==='BEARDASH_PUSH_CAPABILITY')event.ports?.[0]?.postMessage({push:1});});
