const CACHE='mt-agent-shell-v10';
const FILES=['/','/index.html','/style.css','/app.js','/agent-ui.js','/chat-stream.js','/project-contract.js','/design-tokens.css','/fonts/noto-sans-bengali-bengali-wght-normal.woff2','/fonts/noto-sans-bengali-latin-wght-normal.woff2','/icon.svg','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('mt-agent-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!FILES.includes(u.pathname))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'আরমান',{
  body:data.body||'চ্যাটে নতুন উত্তর আছে।',tag:data.tag||'arman',icon:'/icon-192.png',badge:'/icon-192.png',data:{url:data.url||'/'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||'/',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const current=clients.find(client=>new URL(client.url).origin===url.origin);
  if(current){await current.navigate(url.href);return current.focus();}
  return self.clients.openWindow(url.href);
 }));
});
