'use strict';
const REQUESTS_KEY = 'beardash.requests.v1';
const SETTINGS_KEY = 'beardash.settings.v1';
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
let requests = read(REQUESTS_KEY, []);
if (!Array.isArray(requests)) requests = [];
const defaultSettings = {venmo:'Kris-Timchuck',email:'gamersgauntletmi@gmail.com',bearName:''};
let settings = read(SETTINGS_KEY, defaultSettings);
if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
const $ = selector => document.querySelector(selector);
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').style.display = 'none'; }, 4500); }
function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('Storage is unavailable. Your change could not be saved.'); return false; } }
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
  $('#member-list').innerHTML = requests.length ? requests.map(r => card(r)).join('') : empty;
  $('#bear-list').innerHTML = requests.length ? requests.map(r => card(r,true)).join('') : empty;
}
$('#request-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  const name = data.get('name').trim(), order = data.get('order').trim(), date = data.get('date');
  if (!name || !order || !upcomingDates().includes(date)) return toast('Enter a name, order number, and upcoming game night.');
  const next = [{id:crypto.randomUUID(),name,order,date,notes:data.get('notes').trim(),status:'pending',createdAt:new Date().toISOString()},...requests];
  if (!persist(REQUESTS_KEY,next)) return;
  requests = next; event.currentTarget.reset(); render(); toast('Saved locally. Try accepting it in Bear’s dashboard.');
});
for (const field of ['venmo','email','bearName']) $('#settings-form').elements[field].value = settings[field] || '';
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  const next = Object.fromEntries(['venmo','email','bearName'].map(key => [key,data.get(key).trim()]));
  if (!persist(SETTINGS_KEY,next)) return;
  settings = next; render(); $('#saved').textContent = 'Saved on this device.';
});
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.view) { for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== button.dataset.view; for (const tab of document.querySelectorAll('[data-view]')) tab.classList.toggle('active',tab === button); }
  if (button.dataset.action === 'setup') { $('.settings').open = true; $('.settings').scrollIntoView({behavior:'smooth'}); }
  const transitions = {accept:'accepted',decline:'declined',deliver:'delivered'};
  if (transitions[button.dataset.action]) {
    const next = requests.map(r => r.id === button.dataset.id ? {...r,status:transitions[button.dataset.action]} : r);
    if (persist(REQUESTS_KEY,next)) { requests = next; render(); toast('Pickup updated on this device.'); }
  }
});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('#install').hidden = true; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => console.info('Offline support is unavailable in this browser.'));
render();
