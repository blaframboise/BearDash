'use strict';
window.BearDashPush=(()=>{
 const cacheName='beardash-push-settings-v1';
 let config=null,enabled=false,busy=false,generation=0,refreshing=false;
 let pendingRoute=null;
 const panel=document.createElement('section');panel.className='push-panel';panel.hidden=true;
 panel.innerHTML='<h3>BearDash notifications</h3><p class="muted">Alerts for new pickup requests, member replies, and refund requests. Only Bear’s devices receive these alerts.</p><p id="push-status" role="status" aria-live="polite"></p><div class="actions"><button type="button" id="push-initialize" hidden>Initialize push service</button><button type="button" id="push-enable" hidden>Enable notifications</button><button type="button" id="push-disable" hidden>Disable on this device</button><button type="button" id="push-test" hidden>Send test notification</button></div>';
 accountMenu.append(panel);
 const status=document.querySelector('#push-status');
 const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window)&&(!isIOS()||installed());
 const rpc=(name,args={})=>database('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
 function keyBytes(value){const normalized=value.replace(/-/g,'+').replace(/_/g,'/');const decoded=atob(normalized+'='.repeat((4-normalized.length%4)%4));return Uint8Array.from(decoded,char=>char.charCodeAt(0));}
 async function registration(){
  const reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker is not ready. Reload BearDash.')),10000))]);
  // A newly deployed service worker activates immediately after caching its assets.
  if(reg.installing){await new Promise(resolve=>{const worker=reg.installing;const finish=()=>{if(['activated','redundant'].includes(worker.state)){worker.removeEventListener('statechange',finish);resolve();}};worker.addEventListener('statechange',finish);finish();setTimeout(resolve,10000);});}
  await new Promise((resolve,reject)=>{
   const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('The app update is not active yet. Reload BearDash and try again.'));},4000);
   channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.push===1?resolve():reject(Error('Push service worker unavailable'));};
   if(!reg.active){clearTimeout(timer);reject(Error('No active service worker'));return;}
   reg.active.postMessage({type:'BEARDASH_PUSH_CAPABILITY'},[channel.port2]);
  });
  return reg;
 }
 async function preference(value){
  const scope=new URL('./',location.href).href;
  try{
   const cache=await caches.open(cacheName),url=new URL('.beardash-push-state',scope).href;
   if(typeof value==='boolean'){await cache.put(url,new Response(JSON.stringify({enabled:value}),{headers:{'Content-Type':'application/json'}}));return value;}
   return (await (await cache.match(url))?.json())?.enabled===true;
  }catch{return false;}
 }
 function readRoute(value){
  try{const url=new URL(value,location.href),base=new URL('./',location.href);if(url.origin!==base.origin||url.pathname!==base.pathname)return null;
   const view=url.searchParams.get('push_view');if(!['bear','refunds'].includes(view))return null;
   const id=url.searchParams.get('push_request');return {view,requestId:id&&/^[0-9a-f-]{36}$/i.test(id)?id:null};
  }catch{return null;}
 }
 async function routePending(){
  if(!pendingRoute||loading)return;
  if(!user)return;
  if(role!=='bear'){pendingRoute=null;return;}
  const route=pendingRoute;pendingRoute=null;
  if(accountMenu.open)accountMenu.close();showView(route.view);
  if(route.requestId && requests.some(request=>request.id===route.requestId))openConversation(route.requestId);
 }
 function render(){
  const admin=approvalState.is_admin===true;panel.hidden=role!=='bear'&&!admin;
  document.querySelector('#push-initialize').hidden=!admin||config?.configured===true;
  document.querySelector('#push-enable').hidden=role!=='bear'||enabled;
  document.querySelector('#push-enable').disabled=busy||!supported()||!config?.configured||Notification.permission==='denied';
  document.querySelector('#push-disable').hidden=role!=='bear'||!enabled;
  document.querySelector('#push-test').hidden=role!=='bear'||!enabled;
  for(const button of panel.querySelectorAll('button:not(#push-enable)'))button.disabled=busy;
  if(pendingRoute&&user&&!loading)queueMicrotask(()=>routePending());
 }
 async function refresh(){
  if(refreshing||busy)return;
  const version=generation,auth=authEpoch;refreshing=true;
  try{
   if(role!=='bear')await preference(false);
   if(role!=='bear'&&!approvalState.is_admin){enabled=false;config=null;if(!session)await preference(false);render();await routePending();return;}
   const data=await rpc('beardash_push_public_config');if(version!==generation||auth!==authEpoch||busy)return;config=data;
   if(role==='bear'){
    if(!supported()){enabled=false;status.textContent=isIOS()?'Open BearDash from its home-screen icon to enable notifications. iOS 16.4 or later is required.':'This browser does not support BearDash push notifications.';}
    else if(Notification.permission==='denied'){enabled=false;await preference(false);status.textContent='Notifications are blocked. Allow BearDash notifications in your device settings, then reopen the app.';}
    else if(!config.configured){enabled=false;status.textContent='The organizer needs to finish the push-service setup first.';}
    else{
     const reg=await registration(),subscription=await reg.pushManager.getSubscription();
     const registered=subscription?await rpc('beardash_push_subscription',{push_endpoint:subscription.endpoint}):false;
     if(version!==generation||auth!==authEpoch||busy)return;
     enabled=!!registered&&Notification.permission==='granted'&&await preference();
     status.textContent=enabled?'Notifications are enabled on this device. Focus and device settings can silence alerts.':'Enable notifications to receive alerts while BearDash is closed.';
    }
   }else status.textContent=config.configured?'Push service initialized. Bear can now enable notifications on his devices.':'Deploy the push Edge Function, then initialize it here. Private keys stay on the server.';
   render();await routePending();
  }catch{if(version===generation&&auth===authEpoch){enabled=false;config=null;status.textContent='Could not check notifications. Refresh BearDash and check the connection. If setup is new, ask the organizer to finish it.';render();await routePending();}}
  finally{refreshing=false;}
 }
 document.querySelector('#push-initialize').addEventListener('click',async()=>{
  if(busy||!approvalState.is_admin)return;generation++;busy=true;render();status.textContent='Initializing the private push keys…';
  try{await api('/functions/v1/beardash-push',{method:'POST',body:JSON.stringify({action:'initialize'})},await readyToken());status.textContent='Push initialized. Install the retry scheduler if you have not done so yet.';}
  catch{status.textContent='Could not initialize push. Confirm the Edge Function is deployed with its documented JWT setting, then try again.';}
  finally{busy=false;render();}
  if(status.textContent.startsWith('Push initialized'))await refresh();
 });
 document.querySelector('#push-enable').addEventListener('click',async()=>{
  if(busy||role!=='bear'||!supported()||!config?.public_key)return;
  generation++;busy=true;render();const version=generation,auth=authEpoch;
  try{
   // The permission prompt must follow this user gesture before network requests.
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted'){status.textContent='Permission was not granted. You can allow BearDash in device notification settings.';return;}
   if(version!==generation||auth!==authEpoch)return;
   const reg=await registration();let subscription=await reg.pushManager.getSubscription();
   if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.public_key)});
   const data=subscription.toJSON();
   await preference(true);
   await rpc('beardash_push_subscribe',{push_endpoint:data.endpoint,p256dh_key:data.keys.p256dh,auth_key:data.keys.auth});
   if(version!==generation||auth!==authEpoch){await subscription.unsubscribe();return;}
   enabled=true;await preference(true);status.textContent='Notifications enabled. Tap Send test notification to check delivery.';
  }catch{await preference(false);if(version===generation)status.textContent='Could not enable notifications. Check the connection and try again from the installed BearDash app.';}
  finally{if(version===generation){busy=false;render();}}
 });
 async function disable(token){
  generation++;enabled=false;await preference(false);
  if(!('serviceWorker' in navigator))return;
  try{
   const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);const subscription=await reg?.pushManager?.getSubscription();
   if(subscription){
    // Stop the browser subscription even when the server is unreachable.
    const endpoint=subscription.endpoint;
    await subscription.unsubscribe();
    if(token)await api('/rest/v1/rpc/beardash_push_unsubscribe',{method:'POST',body:JSON.stringify({push_endpoint:endpoint})},token).catch(()=>{});
   }
  }catch{}
 }
 document.querySelector('#push-disable').addEventListener('click',async()=>{
  if(busy)return;busy=true;render();await disable(session?.access_token);busy=false;status.textContent='Notifications disabled on this device.';render();
 });
 document.querySelector('#push-test').addEventListener('click',async()=>{
  if(busy||!enabled)return;busy=true;render();status.textContent='Queuing a test notification…';
  try{await rpc('beardash_push_test');status.textContent='Test queued. It should arrive shortly, or within about a minute. If it does not, ask the organizer to check the push function and scheduler.';}
  catch{status.textContent='Could not queue the test. Check your connection and try again.';}
  finally{busy=false;render();}
 });
 async function signOut(token){generation++;busy=false;config=null;enabled=false;pendingRoute=null;status.textContent='';render();await disable(token);}
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type!=='BEARDASH_PUSH_OPEN')return;
  pendingRoute=readRoute(event.data.url);if(pendingRoute)sync().then(routePending);
 });
 pendingRoute=readRoute(location.href);
 if(pendingRoute){const clean=new URL(location.href);clean.searchParams.delete('push_view');clean.searchParams.delete('push_request');history.replaceState(null,'',clean.pathname+clean.search+clean.hash);}
 if(!session)preference(false);
 render();if(role&&!loading)refresh();
 return {render,refresh,signOut};
})();
