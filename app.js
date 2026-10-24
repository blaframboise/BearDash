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
 const response = await fetch(PROJECT + path, {...options,cache:'no-store',headers:{apikey:PUBLIC_KEY,...(token ? {Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers}});
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
 fieldset.disabled = !role || loading;
 $('#auth-form').hidden = !!user;
 $('#signout').hidden = !user;
 $('#refresh').hidden = !user;
 $('[data-view="bear"]').hidden = role !== 'bear';
 $('.settings').hidden = role !== 'bear';
 if (role !== 'bear') { $('#bear').hidden = true; $('#member').hidden = false; $('[data-view="member"]').classList.add('active'); $('[data-view="bear"]').classList.remove('active'); }
 $('#account-status').textContent = user ? `${user.email} · ${role === 'bear' ? 'Bear’s account' : role ? 'BearDash member' : 'Awaiting group approval. Ask the organizer to approve your account.'}` : 'Sign in or create an account. New accounts need group approval.';
}
async function sync(manual = false) {
 if (loading || !session) return;
 const epoch = authEpoch; loading = true; accountUI();
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
  requests = []; role = null; render();
  $('#connection-status').textContent = 'Connection unavailable. Check your connection or sign out and back in. If setup is new, the organizer must run the database setup.';
  toast(error.message);
 } finally { if(epoch === authEpoch) { loading = false; accountUI(); $('#refresh').disabled = false; $('#refresh').textContent = 'Refresh pickups'; } }
}
async function login(create = false) {
 if(loading) return;
 const form = $('#auth-form'); if(!form.reportValidity()) return;
 const data = new FormData(form); loading = true;
 const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
 try {
  const credentials = {email:data.get('email').trim(),password:data.get('password')};
  const redirect = location.origin+location.pathname;
  const result = await api(create ? '/auth/v1/signup?redirect_to='+encodeURIComponent(redirect) : '/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify(credentials)},null);
  if (result.access_token) { authEpoch++; storeSession({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in}); user = result.user; form.reset(); }
  else { $('#account-status').textContent = 'Check your email for the confirmation link, then return here to sign in. If no email arrives, contact the organizer.'; toast('Check your email to confirm your account.'); }
 } catch(error) { toast(error.message); }
 finally { loading = false; buttons.forEach(b=>b.disabled=false); }
 if(session) await sync();
}
$('#auth-form').addEventListener('submit',event=>{event.preventDefault();login();});
$('#signup').addEventListener('click',()=>login(true));
$('#signout').addEventListener('click',()=>{
 const token = session?.access_token; authEpoch++; loading=false; storeSession(null); user=null; role=null; requests=[];$('#request-form').reset();render();accountUI();$('#refresh').disabled=false;$('#refresh').textContent='Refresh pickups';
 $('#connection-status').textContent='Signed out. Sign in to connect to your playgroup.';
 if(token) api('/auth/v1/logout',{method:'POST'},token).catch(()=>{});
});
$('#refresh').addEventListener('click',()=>sync(true));
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
 event.preventDefault(); if(!role || loading) return;
 const form = event.currentTarget, data = new FormData(form);
 const name = data.get('name').trim(), order = data.get('order').trim(), date = data.get('date');
 if (!name || !order || !upcomingDates().includes(date)) return toast('Enter a name, order number, and upcoming game night.');
 fieldset.disabled = true;
 try { await database('pickup_requests',{method:'POST',body:JSON.stringify({user_id:user.id,name,order,date,notes:data.get('notes').trim()})});form.reset();toast('Request sent to Bear.');await sync(); }
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
 if(button.dataset.view) {
  if(button.dataset.view === 'bear' && role !== 'bear') return;
  for(const view of document.querySelectorAll('.view')) view.hidden = view.id !== button.dataset.view;
  for(const tab of document.querySelectorAll('[data-view]')) tab.classList.toggle('active',tab===button);
 }
 if(button.dataset.action==='setup') {
  if(role === 'bear') { $('.settings').open=true;$('.settings').scrollIntoView({behavior:'smooth'}); }
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
