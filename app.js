'use strict';
let requests = [];
let settings = {venmo:'Kris-Timchuck',email:'gamersgauntletmi@gmail.com',bearName:''};
let user = null, role = null, loading = false;
const PROJECT = 'https://bvokijnmogjmftkggbxn.supabase.co';
const PUBLIC_KEY = 'sb_publishable_h1qDQ4i4AQ2KhY3r7tMROA_3ttUMRqW';
let session = null;
try { session = JSON.parse(sessionStorage.getItem('beardash.auth')); } catch {}
let authEpoch = 0, refreshPromise;
function storeSession(value) { session = value; try { if(value) sessionStorage.setItem('beardash.auth',JSON.stringify(value)); else sessionStorage.removeItem('beardash.auth'); } catch {} }
async function api(path, options = {}, token = session?.access_token) {
 const response = await fetch(PROJECT + path, {...options,signal:options.signal || AbortSignal.timeout(20000),cache:'no-store',headers:{apikey:PUBLIC_KEY,...(token ? {Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers}});
 const data = await response.json().catch(()=>null);
 if (!response.ok) throw new Error(data?.msg || data?.error_description || data?.message || `Connection failed (${response.status})`);
 return data;
}
async function readyToken() {
 if (!session) throw new Error('Please sign in first.');
 if (session.expires_at * 1000 < Date.now()+60000) {
  if (!refreshPromise) { const epoch = authEpoch; refreshPromise = api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},null).then(data=>{if(epoch !== authEpoch) throw new Error('Session changed. Please sign in again.');storeSession({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});}).finally(()=>{refreshPromise=null;}); }
  await refreshPromise;
 }
 return session.access_token;
}
async function database(path, options) { return api('/rest/v1/'+path,options,await readyToken()); }
const $ = selector => document.querySelector(selector);
// Keep each task on its own screen; account controls live in the header menu.
const menuButton = document.createElement('button');
menuButton.id = 'account-menu-button'; menuButton.type = 'button';
menuButton.textContent = '☰'; menuButton.setAttribute('aria-label','Open account menu');
menuButton.setAttribute('aria-haspopup','dialog');menuButton.setAttribute('aria-expanded','false');
$('header').append(menuButton);
const accountMenu = document.createElement('dialog');accountMenu.id='account-menu';accountMenu.setAttribute('aria-labelledby','account-menu-title');
const closeMenu=document.createElement('button');closeMenu.textContent='Close ×';closeMenu.className='close-menu';closeMenu.type='button';
accountMenu.append(closeMenu,$('.account'),$('#connection-status'),$('.settings'));
accountMenu.querySelector('.account h2').id='account-menu-title';document.body.append(accountMenu);
const menuLinks=document.createElement('div');menuLinks.className='menu-links';menuLinks.setAttribute('aria-label','BearDash shortcuts');
menuLinks.innerHTML='<p class="eyebrow">BEARDASH MENU</p><button type="button" data-view="home" data-member-menu>Home</button><button type="button" data-view="member" data-member-menu>My Pickups</button><button type="button" data-view="request" data-member-menu>Request a Pickup</button><button type="button" data-view="bear" data-bear-menu hidden>Bear’s Dashboard</button><button type="button" id="account-shortcut">My BearDash Account</button><a href="https://www.gamersgauntlet.net/" target="_blank" rel="noopener noreferrer">Link to Gamer’s ↗</a><a id="support-link" href="mailto:BearDash.support@gmail.com?subject=%5BBearDash%20Support%5D%20App%20feedback&body=What%20happened%2C%20or%20what%20would%20you%20like%20improved%3F%0A%0APhone%2Fbrowser%20%28if%20relevant%29%3A%0A%0APlease%20do%20not%20include%20passwords%20or%20payment%20details.%20For%20order%20or%20pickup%20questions%2C%20contact%20Bear%20directly.">Contact BearDash App Support ↗</a><small class="muted">Opens your email app. Review your feedback and tap Send. For pickup questions, contact Bear directly for now.</small>';
accountMenu.insertBefore(menuLinks,accountMenu.querySelector('.account'));
$('#account-shortcut').addEventListener('click',()=>{const heading=accountMenu.querySelector('.account h2');heading.setAttribute('tabindex','-1');heading.scrollIntoView({behavior:'smooth',block:'start'});heading.focus({preventScroll:true});});
menuButton.addEventListener('click',()=>{accountMenu.showModal();menuButton.setAttribute('aria-expanded','true');});
closeMenu.addEventListener('click',()=>accountMenu.close());
accountMenu.addEventListener('close',()=>menuButton.setAttribute('aria-expanded','false'));
accountMenu.addEventListener('click',event=>{if(event.target===accountMenu){const r=accountMenu.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)accountMenu.close();}});
const home=document.createElement('section');home.id='home';home.className='view';
home.append($('.hero'),$('.route'),$('.how'));
const ordering=document.createElement('section');ordering.className='panel order-guide';
ordering.innerHTML='<p class="eyebrow">START AT THE STORE</p><h2>Order cards. Then request your run.</h2><ol><li>Visit Gamer’s Gauntlet and place your order directly with the store. Choose store pickup if offered.</li><li>Find your order number on the confirmation page or in the store’s confirmation email. Press and hold the number on your phone to copy it.</li><li>Return to BearDash, choose Request a Pickup, and paste the order number. Use the same name as your store order.</li></ol><div class="actions"><a href="https://www.gamersgauntlet.net/" target="_blank" rel="noopener noreferrer">Visit Gamer’s Gauntlet ↗</a><button type="button" data-view="request">Request a Pickup →</button></div><p class="muted">The store opens in a separate tab. BearDash does not place card orders or import order numbers automatically.</p>';
home.insertBefore(ordering,home.querySelector('.how'));
const requestScreen=document.createElement('section');requestScreen.id='request';requestScreen.className='view';requestScreen.hidden=true;
requestScreen.append($('#request-form').closest('.panel'));
const oldColumns=$('#member .columns');const pickupPanel=$('#member-list').parentElement;oldColumns.replaceWith(pickupPanel);
$('#member').hidden=true;$('main').prepend(home);$('main').append(requestScreen);
$('nav').innerHTML='<button class="active" data-view="home" aria-current="page">Main</button><button data-view="member">My Pickups</button><button data-view="request">Request a Pickup</button><button data-view="bear" hidden>Bear’s dashboard <span id="badge">0</span></button>';
$('main').prepend($('nav'));
let activeView='home', navigationRole;
function showView(id, scroll=true) {
 if(role==='bear') id='bear';
 else if(id==='bear') id='home';
 if(!['home','member','request','bear'].includes(id)) return;
 activeView=id;
 for(const view of document.querySelectorAll('main > .view')) view.hidden=view.id!==id;
 for(const tab of document.querySelectorAll('nav [data-view]')) {tab.classList.toggle('active',tab.dataset.view===id);if(tab.dataset.view===id)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 if(scroll) {window.scrollTo({top:0,behavior:'instant'});const title=$('#'+id+' h1, #'+id+' h2');if(title){title.setAttribute('tabindex','-1');title.focus({preventScroll:true});}}
}
for(const logo of document.querySelectorAll('.brand')) logo.addEventListener('click',event=>{event.preventDefault();showView(role==='bear'?'bear':'home');});
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').style.display = 'none'; }, 4500); }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function dateLabel(value) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {timeZone:'America/Detroit',weekday:'long',month:'short',day:'numeric'}); }
function upcomingDates(now = new Date()) {
  const local = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = type => local.find(p => p.type === type).value;
  const day = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  const result = [];
  for (let i = 0; i < 29; i++) { if ([1,5].includes(day.getUTCDay())) result.push(day.toISOString().slice(0,10)); day.setUTCDate(day.getUTCDate() + 1); }
  return result;
}
$('#dates').innerHTML = upcomingDates().map(date => `<option value="${date}">${dateLabel(date)}</option>`).join('');
function emailLink(request) {
  const subject = `Pickup authorization: order ${request.order}`;
  const body = `Hello Gamer’s Gauntlet,\n\nI authorize ${settings.bearName} to pick up my order ${request.order}, placed under ${request.name}, on ${dateLabel(request.date)}.\n\nPlease let me know if you need any additional information or authorization.\n\nThank you,\n${request.name}`;
  return `mailto:${encodeURIComponent(settings.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function venmoLink(request) { return `https://venmo.com/${encodeURIComponent(settings.venmo)}?txn=pay&amount=5.00&note=${encodeURIComponent(`BearDash pickup: ${request.order} · ${request.name}`)}`; }
function card(request, bear = false) {
  const statusNames = {pending:'Waiting for Bear',accepted:'Accepted',declined:'Declined',delivered:'Delivered'};
  let actions = '';
  if (bear && request.status === 'pending') actions = `<button data-action="accept" data-id="${escapeHTML(request.id)}">Accept pickup ✓</button><button data-action="decline" data-id="${escapeHTML(request.id)}">Decline</button>`;
  if (bear && request.status === 'accepted') actions = `<button data-action="deliver" data-id="${escapeHTML(request.id)}">Mark delivered ✓</button>`;
  if (!bear && request.status === 'accepted') {
    actions = settings.venmo && /^[A-Za-z0-9_-]+$/.test(settings.venmo) ? `<a href="${escapeHTML(venmoLink(request))}" target="_blank" rel="noopener noreferrer">Open Venmo · $5 ↗</a>` : '<button data-action="setup">Set Bear’s Venmo</button>';
    actions += settings.email && settings.bearName ? `<a href="${escapeHTML(emailLink(request))}">Compose store email ↗</a>` : '<button data-action="setup">Set pickup email & name</button>';
  }
  return `<article class="card"><div class="card-top"><h3>${escapeHTML(request.order)}</h3><span class="status ${escapeHTML(request.status)}">${statusNames[request.status] || 'Unknown'}</span></div><p>${escapeHTML(request.name)} · ${escapeHTML(dateLabel(request.date))}\n${escapeHTML(request.notes)}</p>${request.status === 'accepted' && !bear ? '<p>Confirm the recipient and $5 in Venmo. Review and send the authorization from your own email account. Opening these links does not confirm payment or delivery of email.</p>' : ''}<div class="actions">${actions}</div></article>`;
}
function render() {
  $('#count').textContent = `${requests.length} request${requests.length === 1 ? '' : 's'}`;
  $('#badge').textContent = requests.filter(r => r.status === 'pending').length;
  const empty = '<div class="empty"><span>🐾</span>No pickups yet.<br>Your next game-night delivery starts here.</div>';
  const mine = requests.filter(r => r.user_id === user?.id);
  $('#count').textContent = `${mine.length} request${mine.length === 1 ? '' : 's'}`;
  $('#member-list').innerHTML = !role ? '<div class="empty">Sign in with an approved playgroup account to see pickups.</div>' : mine.length ? mine.map(r => card(r)).join('') : empty;
  $('#bear-list').innerHTML = role === 'bear' && requests.length ? requests.map(r => card(r,true)).join('') : empty;
}
const fieldset = document.createElement('fieldset');
while ($('#request-form').firstChild) fieldset.append($('#request-form').firstChild);
$('#request-form').append(fieldset);
function accountUI() {
 fieldset.disabled = !role || role === 'bear' || loading;
 $('#auth-form').hidden = !!user;
 $('#signout').hidden = !user;
 $('#refresh').hidden = !user;
 $('[data-view="bear"]').hidden = role !== 'bear';
 $('.settings').hidden = role !== 'bear';
 for(const entry of menuLinks.querySelectorAll('[data-member-menu]')) entry.hidden = role === 'bear';
 menuLinks.querySelector('[data-bear-menu]').hidden = role !== 'bear';
 for(const tab of document.querySelectorAll('nav [data-view]')) tab.hidden = role === 'bear' ? tab.dataset.view !== 'bear' : tab.dataset.view === 'bear';
 if(navigationRole !== role) {navigationRole=role;showView(role === 'bear' ? 'bear' : 'home',false);} else showView(activeView,false);
 $('#account-status').textContent = user ? `${user.email} · ${role === 'bear' ? 'Bear’s account' : role ? 'BearDash member' : 'Awaiting group approval. Ask the organizer to approve your account.'}` : 'Sign in or create an account. New accounts need group approval.';
}
async function sync(manual = false) {
 if (loading || !session) return;
 const epoch = authEpoch; let syncError=null; loading = true; accountUI();
 $('#refresh').disabled = true; $('#refresh').textContent = 'Refreshing…';
 try {
  const token = await readyToken();
  const currentUser = await api('/auth/v1/user',{},token);
  const members = await database('group_members?select=role&user_id=eq.'+encodeURIComponent(currentUser.id));
  const currentRole = members[0]?.role || null;
  const [rows,config] = currentRole ? await Promise.all([database('pickup_requests?select=*&order=created_at.desc&limit=500'),database('group_settings?select=*&id=eq.true')]) : [[],[]];
  if(epoch !== authEpoch) return;
  user = currentUser; role = currentRole; requests = rows;
  const nameInput = $('#request-form').elements.name;
  if (!nameInput.value.trim()) nameInput.value = user.user_metadata?.pickup_name || rows.find(r => r.user_id === user.id)?.name || '';
  if(config[0]) settings = config[0];
  for (const field of ['venmo','email','bearName']) $('#settings-form').elements[field].value = settings[field] || '';
  $('#connection-status').textContent = role ? 'CONNECTED · Updates refresh every 15 seconds while this page is open. Up to 500 recent requests shown.' : 'ACCOUNT CONNECTED · Group approval is required.';
  render();
  if (manual) toast('Pickups refreshed.');
 } catch(error) {
  if(epoch !== authEpoch) return;
  requests = []; role = null; syncError=error.message; render();
  $('#connection-status').textContent = 'Could not load your account: '+error.message;
  $('#account-status').textContent = 'Account connection failed. See the connection message below, then retry Refresh pickups.';
  toast(error.message);
 } finally { if(epoch === authEpoch) { loading = false; accountUI(); if(syncError) $('#account-status').textContent='Could not load your account: '+syncError; $('#refresh').disabled = false; $('#refresh').textContent = 'Refresh pickups'; } }
}
async function login(create = false) {
 if(loading) return;
 const form = $('#auth-form');
 const status = $('#account-status');
 if(!form.reportValidity()) {status.textContent='Enter a valid email and a password of at least 8 characters.';return;}
 status.textContent = create ? 'Creating your account…' : 'Signing in…';
 const data = new FormData(form); loading = true;
 const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
 const signInButton=form.querySelector('[type=submit]');signInButton.textContent=create ? 'Creating account…' : 'Signing in…';
 try {
  const credentials = {email:data.get('email').trim(),password:data.get('password')};
  const redirect = location.origin+location.pathname;
  const result = await api(create ? '/auth/v1/signup?redirect_to='+encodeURIComponent(redirect) : '/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify(credentials)},null);
  if (result.access_token) { authEpoch++; storeSession({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in}); user = result.user; form.reset(); }
  else { $('#account-status').textContent = 'Check your email for the confirmation link, then return here to sign in. If no email arrives, contact the organizer.'; toast('Check your email to confirm your account.'); }
 } catch(error) {
  const message = error.name === 'TimeoutError' ? 'Sign-in timed out. Check your connection and try again.' : error.message;
  status.textContent='Could not sign in: '+message; toast(message);
 }
 finally { loading = false; buttons.forEach(b=>b.disabled=false);signInButton.textContent='Sign in'; }
 if(session) { await sync(); if(role && accountMenu.open) accountMenu.close(); }
}
$('#auth-form').addEventListener('submit',event=>{event.preventDefault();login();});
$('#signup').addEventListener('click',()=>login(true));
$('#signout').addEventListener('click',()=>{
 const token = session?.access_token; authEpoch++; loading=false; storeSession(null); user=null; role=null; requests=[];$('#request-form').reset();render();accountUI();$('#refresh').disabled=false;$('#refresh').textContent='Refresh pickups';
 $('#connection-status').textContent='Signed out. Sign in to connect to your playgroup.';
 if(token) api('/auth/v1/logout',{method:'POST'},token).catch(()=>{});
});
$('#refresh').addEventListener('click',()=>sync(true));
const pickupRefresh=document.createElement('button');pickupRefresh.type='button';pickupRefresh.textContent='Refresh';pickupRefresh.addEventListener('click',()=>sync(true));$('#member .section-title').append(pickupRefresh);

$('#request-form').elements.name.addEventListener('change',async event=>{
 const name = event.target.value.trim();
 if (!user || !name || name.length > 80) return;
 const epoch = authEpoch;
 try {
  const updated = await api('/auth/v1/user',{method:'PUT',body:JSON.stringify({data:{pickup_name:name}})},await readyToken());
  if(epoch === authEpoch) user = updated;
 } catch { toast('Your pickup name could not be remembered. You can still enter it for this request.'); }
});
$('#request-form').addEventListener('submit', async event => {
 event.preventDefault(); if(!role || role === 'bear' || loading) return;
 const form = event.currentTarget, data = new FormData(form);
 const name = data.get('name').trim(), order = data.get('order').trim(), date = data.get('date');
 if (!name || !order || !upcomingDates().includes(date)) return toast('Enter a name, order number, and upcoming game night.');
 fieldset.disabled = true;
 try { await database('pickup_requests',{method:'POST',body:JSON.stringify({user_id:user.id,name,order,date,notes:data.get('notes').trim()})});form.reset();toast('Request sent to Bear.');await sync();showView('member'); }
 catch(error) { toast('Request could not be saved: '+error.message); }
 finally { accountUI(); }
});
$('#settings-form').addEventListener('submit', async event => {
 event.preventDefault(); if(role !== 'bear') return;
 const data = new FormData(event.currentTarget), button = event.currentTarget.querySelector('button'); button.disabled=true;
 const next = Object.fromEntries(['venmo','email','bearName'].map(key=>[key,data.get(key).trim()]));
 try { await database('group_settings?id=eq.true',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(next)});settings=next;render();$('#saved').textContent='Saved for the playgroup.'; }
 catch(error) { toast('Settings could not be saved: '+error.message); }
 finally {button.disabled=false;}
});
document.addEventListener('click', async event => {
 const button = event.target.closest('button'); if(!button) return;
 if(button.dataset.view) { if(accountMenu.open && accountMenu.contains(button)) accountMenu.close(); showView(button.dataset.view); }
 if(button.dataset.action==='setup') {
  if(role === 'bear') { accountMenu.showModal();menuButton.setAttribute('aria-expanded','true');$('.settings').open=true;$('.settings').scrollIntoView({behavior:'smooth'}); }
  else toast('Ask Bear to set his pickup name and contact details.');
 }
 const transitions = {accept:'accepted',decline:'declined',deliver:'delivered'};
 if(transitions[button.dataset.action] && role === 'bear') {
  button.disabled=true;
  const oldStatus = button.dataset.action === 'deliver' ? 'accepted' : 'pending';
  try {
   const updated = await database('pickup_requests?id=eq.'+encodeURIComponent(button.dataset.id)+'&status=eq.'+oldStatus,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:transitions[button.dataset.action]})});
   toast(updated.length ? 'Pickup updated for the playgroup.' : 'That request already changed. Refreshing.');await sync();
  } catch(error) {toast('Could not update pickup: '+error.message);}
  finally {button.disabled=false;}
 }
});
// Confirmation links return a short-lived session in the URL fragment. Remove it immediately.
const fragment = new URLSearchParams(location.hash.slice(1));
if(fragment.has('access_token')) {
 const access_token=fragment.get('access_token'), refresh_token=fragment.get('refresh_token');
 history.replaceState(null,'',location.pathname+location.search);
 if(access_token && refresh_token) storeSession({access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(fragment.get('expires_in') || 3600)});
} else if(fragment.has('error_description')) { toast(fragment.get('error_description'));history.replaceState(null,'',location.pathname+location.search); }
accountUI();
if(session) sync();
setInterval(()=>{if(!document.hidden && session) sync();},15000);
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('#install').hidden = true; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => console.info('Offline support is unavailable in this browser.'));
render();
