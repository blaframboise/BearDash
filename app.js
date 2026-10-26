'use strict';
let requests = [];
let settings = {venmo:'Kris-Timchuck',email:'gamersgauntletmi@gmail.com',bearName:''};
let user = null, role = null, loading = false;
let approvalState={can_approve:false,is_admin:false,own_status:"pending",pending:[]};
const PROJECT = 'https://bvokijnmogjmftkggbxn.supabase.co';
const PUBLIC_KEY = 'sb_publishable_h1qDQ4i4AQ2KhY3r7tMROA_3ttUMRqW';
const AUTH_KEY='beardash.auth';
function readStoredSession(storage) {
 try {const value=JSON.parse(storage.getItem(AUTH_KEY));return value && typeof value.access_token==='string' && typeof value.refresh_token==='string' ? value : null;} catch {return null;}
}
let session=null;
try {session=readStoredSession(localStorage);} catch {}
if(!session) {let signedOut=false;try{signedOut=localStorage.getItem('beardash.signedOut')==='true';}catch{}
 if(!signedOut) {try {session=readStoredSession(sessionStorage);} catch {}}
}
let authEpoch = 0, refreshPromise;
function storeSession(value) {
 session=value;
 try {if(value) {localStorage.setItem(AUTH_KEY,JSON.stringify(value));localStorage.removeItem('beardash.signedOut');}else {localStorage.setItem('beardash.signedOut','true');localStorage.removeItem(AUTH_KEY);}} catch {}
 try {if(value) sessionStorage.setItem(AUTH_KEY,JSON.stringify(value));else sessionStorage.removeItem(AUTH_KEY);} catch {}
}
// Migrate existing tab-only logins without asking users to sign in again.
if(session) storeSession(session);
async function api(path, options = {}, token = session?.access_token) {
 const response = await fetch(PROJECT + path, {...options,signal:options.signal || AbortSignal.timeout(20000),cache:'no-store',headers:{apikey:PUBLIC_KEY,...(token ? {Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers}});
 const data = await response.json().catch(()=>null);
 if (!response.ok) {const error=new Error(data?.msg || data?.error_description || data?.message || `Connection failed (${response.status})`);error.status=response.status;throw error;}
 return data;
}
async function readyToken() {
 if (!session) throw new Error('Please sign in first.');
 if (!Number.isFinite(session.expires_at) || session.expires_at * 1000 < Date.now()+60000) {
  if (!refreshPromise) { const epoch = authEpoch; refreshPromise = api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},null).then(data=>{if(epoch !== authEpoch) throw new Error('Session changed. Please sign in again.');storeSession({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});}).catch(error=>{if(error.status===400 || error.status===401 || error.status===403)error.reauthenticate=true;throw error;}).finally(()=>{refreshPromise=null;}); }
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
const approvalsScreen=document.createElement('section');approvalsScreen.id='approvals';approvalsScreen.className='view';approvalsScreen.hidden=true;
approvalsScreen.innerHTML='<div class="section-title"><div><p class="eyebrow">WELCOME TO BEARDASH</p><h2>Member Approvals</h2></div><button type="button" id="approval-refresh">Refresh</button></div><p class="muted">Approve people you recognize to give them regular member access. Declining does not delete their account or grant access.</p><p id="approval-status" role="status" aria-live="polite"></p><div id="approval-list"></div><div id="review-confirmation" class="panel" hidden><h3 id="review-title"></h3><p id="review-description" class="muted"></p><div class="actions"><button type="button" id="review-confirm">Confirm</button><button type="button" id="review-cancel">Cancel</button></div></div>';
$('main').append(approvalsScreen);
const approvalsShortcut=document.createElement('button');approvalsShortcut.type='button';approvalsShortcut.dataset.view='approvals';approvalsShortcut.hidden=true;approvalsShortcut.textContent='Member Approvals';menuLinks.insertBefore(approvalsShortcut,$('#account-shortcut'));
const approvalNotification=document.createElement('button');approvalNotification.type='button';approvalNotification.id='approval-notification';approvalNotification.dataset.view='approvals';approvalNotification.hidden=true;$('main').insertBefore(approvalNotification,$('main').firstChild);
let pendingReview=null,reviewing=false,approvalFetching=false;
function clearApprovals() {approvalState={can_approve:false,is_admin:false,own_status:'pending',pending:[]};pendingReview=null;reviewing=false;$('#review-confirm').disabled=false;$('#review-cancel').disabled=false;$('#review-confirmation').hidden=true;$('#approval-list').replaceChildren();$('#approval-status').textContent='';renderApprovals();}
function renderApprovals() {
 const allowed=approvalState.can_approve;
 approvalsShortcut.hidden=!allowed;
 const count=approvalState.pending.length;
 approvalsShortcut.textContent='Member Approvals'+(count?' · '+count:'');
 approvalNotification.hidden=!allowed || !count;
 approvalNotification.textContent=count+' member'+(count===1?'':'s')+' awaiting approval →';
 menuButton.setAttribute('aria-label',allowed && count ? 'Open account menu, '+count+' pending member approvals' : 'Open account menu');
 if(allowed && count) menuButton.dataset.pending=String(count);else delete menuButton.dataset.pending;
 $('#approval-list').innerHTML=!allowed ? '<div class="empty">Member approvals are available only to Bear and the app administrator.</div>' : !count ? '<div class="empty">No members awaiting approval.</div>' : approvalState.pending.map(person=>`<article class="card applicant"><div><h3>${escapeHTML(person.email)}</h3><p>Email confirmed · ${escapeHTML(messageTime(person.email_confirmed_at))}</p></div><div class="actions"><button type="button" data-review="approved" data-applicant="${escapeHTML(person.id)}">Approve</button><button type="button" data-review="declined" data-applicant="${escapeHTML(person.id)}">Decline</button></div></article>`).join('');
 for(const button of $('#approval-list').querySelectorAll('button')) button.disabled=reviewing;
}
async function refreshApprovals(manual=false) {
 if(!session || approvalFetching || reviewing) return;
 approvalFetching=true;const epoch=authEpoch;$('#approval-refresh').disabled=true;
 if(manual) $('#approval-status').textContent='Checking for new members…';
 try {
  const state=await database('rpc/beardash_approval_state',{method:'POST',body:'{}'});
  if(epoch!==authEpoch) return;
  approvalState=state;renderApprovals();
  if(!state.can_approve && activeView==='approvals') showView(role==='bear'?'bear':'home',false);
  if(manual) $('#approval-status').textContent='Member list refreshed.';
 } catch {if(epoch===authEpoch) {clearApprovals();if(activeView==='approvals') showView(role==='bear'?'bear':'home',false);if(manual) $('#approval-status').textContent='Could not load approvals. Check your connection and confirm the member-approvals SQL has been installed.';}}
 finally {approvalFetching=false;$('#approval-refresh').disabled=false;}
}
$('#approval-refresh').addEventListener('click',()=>refreshApprovals(true));
$('#approval-list').addEventListener('click',event=>{
 const button=event.target.closest('[data-review]');if(!button || reviewing) return;
 const applicant=approvalState.pending.find(person=>person.id===button.dataset.applicant);if(!applicant)return;
 pendingReview={id:applicant.id,decision:button.dataset.review};
 $('#review-title').textContent=(pendingReview.decision==='approved'?'Approve ':'Decline ')+applicant.email+'?';
 $('#review-description').textContent=pendingReview.decision==='approved'?'This grants regular BearDash member access to their own pickups and conversations. It does not grant Bear or administrator permissions.':'This account will remain without group access and will leave the pending list. It will not be deleted.';
 $('#review-confirmation').hidden=false;$('#review-confirm').focus();$('#review-confirmation').scrollIntoView({behavior:'smooth',block:'nearest'});
});
$('#review-cancel').addEventListener('click',()=>{pendingReview=null;$('#review-confirmation').hidden=true;});
$('#review-confirm').addEventListener('click',async()=>{
 if(!pendingReview || reviewing || !approvalState.can_approve)return;
 const review={...pendingReview},epoch=authEpoch;reviewing=true;$('#review-confirm').disabled=true;$('#review-cancel').disabled=true;$('#approval-status').textContent='Saving decision…';renderApprovals();
 try {
  const result=await database('rpc/beardash_review_member',{method:'POST',body:JSON.stringify({applicant_id:review.id,review_decision:review.decision})});
  if(epoch!==authEpoch)return;
  pendingReview=null;$('#review-confirmation').hidden=true;
  $('#approval-status').textContent=result.result==='approved'?'Member approved. They can refresh BearDash to start using it.':result.result==='declined'?'Request declined. No group access was granted.':'This account has already been reviewed. Refreshing the list.';
 } catch(error) {if(epoch===authEpoch) $('#approval-status').textContent='Decision could not be confirmed: '+error.message+'. Refresh the list before retrying.';}
 finally {if(epoch===authEpoch){reviewing=false;$('#review-confirm').disabled=false;$('#review-cancel').disabled=false;await refreshApprovals();}}
});
setInterval(()=>{if(!document.hidden && session && approvalState.can_approve) refreshApprovals();},15000);
let activeView='home', navigationRole;
function showView(id, scroll=true) {
 if(id==='approvals' && !approvalState.can_approve) return;
 if(['schedule','refunds'].includes(id) && role!=='bear') return;
 if(role==='bear' && !['approvals','bearmail','schedule','refunds','previous'].includes(id)) id='bear';
 else if(id==='bear') id='home';
 if(!['home','member','request','bear','approvals','bearmail','schedule','refunds','previous'].includes(id)) return;
 activeView=id;
 for(const view of document.querySelectorAll('main > .view')) view.hidden=view.id!==id;
 for(const tab of document.querySelectorAll('nav [data-view]')) {tab.classList.toggle('active',tab.dataset.view===id);if(tab.dataset.view===id)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 if(scroll) {window.scrollTo({top:0,behavior:'instant'});const title=$('#'+id+' h1, #'+id+' h2');if(title){title.setAttribute('tabindex','-1');title.focus({preventScroll:true});}}
}
for(const logo of document.querySelectorAll('.brand')) logo.addEventListener('click',event=>{event.preventDefault();showView(role==='bear'?'bear':'home');});
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').style.display = 'none'; }, 4500); }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function dateLabel(value) { return new Date(`${value}T16:00:00Z`).toLocaleDateString('en-US', {timeZone:'America/Detroit',weekday:'long',month:'short',day:'numeric'}); }
function upcomingDates(now = new Date()) {
  const local = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = type => local.find(p => p.type === type).value;
  const day = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  const result = [];
  for (let i = 0; i < 57; i++) { if ([1,5].includes(day.getUTCDay())) result.push(day.toISOString().slice(0,10)); day.setUTCDate(day.getUTCDate() + 1); }
  return result;
}
$('#dates').innerHTML = upcomingDates().map(date => `<option value="${date}">${dateLabel(date)}</option>`).join('');
function emailLink(request) {
  const subject = `Pickup authorization: order ${request.order}`;
  const body = `Hello Gamer’s Gauntlet,\n\nI authorize ${settings.bearName} to pick up my order ${request.order}, placed under ${request.name}, on ${dateLabel(request.date)}.\n\nPlease let me know if you need any additional information or authorization.\n\nThank you,\n${request.name}`;
  return `mailto:${encodeURIComponent(settings.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function venmoLink(request) { return `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(settings.venmo)}&amount=5.00&note=${encodeURIComponent(`BearDash pickup: ${request.order} · ${request.name}`)}`; }
const conversation=document.createElement('dialog');conversation.id='conversation';conversation.setAttribute('aria-labelledby','conversation-title');
conversation.innerHTML='<div class="section-title"><h2 id="conversation-title">Pickup conversation</h2><button type="button" id="close-conversation">Close ×</button></div><p class="muted">Private to Bear and the requesting member. Updates while this conversation is open; no push notifications.</p><div id="original-note"></div><button type="button" id="older-messages" hidden>Load older messages</button><div id="message-list" aria-label="Messages"></div><p id="message-status" role="status" aria-live="polite"></p><form id="message-form"><label>Your reply<textarea name="body" rows="3" required maxlength="2000" placeholder="Ask about this pickup…"></textarea></label><button type="submit" class="primary">Send reply</button></form>';
document.body.append(conversation);
let threadId=null, threadEpoch=0, threadMessages=[], messageLoading=false, sendingMessage=false;
function messageTime(value) {return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function renderMessages() {
 const list=$('#message-list');const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<50;
 list.innerHTML=threadMessages.map(message=>`<article class="message ${message.sender_id===user?.id?'mine':''}"><small>${message.sender_role==='bear'?'Bear':'Member'}${message.sender_id===user?.id?' · You':''} · ${escapeHTML(messageTime(message.created_at))}</small><p>${escapeHTML(message.body)}</p></article>`).join('');
 if(atBottom) list.scrollTop=list.scrollHeight;
}
async function loadMessages(older=false) {
 if(!threadId || !session || messageLoading) return;
 const epoch=threadEpoch, auth=authEpoch, id=threadId;messageLoading=true;
 $('#message-status').textContent=older?'Loading older messages…':'Checking for replies…';
 try {
  let query='pickup_messages?select=*&request_id=eq.'+encodeURIComponent(id)+'&order=created_at.desc,id.desc&limit=50';
  if(older && threadMessages.length) {const first=threadMessages[0];query+='&or='+encodeURIComponent(`(created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id}))`);}
  const rows=await database(query);
  if(epoch!==threadEpoch || auth!==authEpoch) return;
  const merged=new Map(threadMessages.map(message=>[message.id,message]));for(const message of rows) merged.set(message.id,message);
  threadMessages=[...merged.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  renderMessages();
  if(older || threadMessages.length<=50) $('#older-messages').hidden=rows.length<50;
  $('#message-status').textContent=threadMessages.length?'Up to date.':'No replies yet. Start the conversation below.';
 } catch(error) {if(epoch===threadEpoch && auth===authEpoch) $('#message-status').textContent='Could not load messages. If this is the first setup, run the messaging SQL. Otherwise retry after checking your connection.';}
 finally {if(epoch===threadEpoch) messageLoading=false;}
}
function closeConversation() {threadEpoch++;threadId=null;threadMessages=[];messageLoading=false;sendingMessage=false;$('#message-form').reset();$('#message-list').replaceChildren();$('#original-note').replaceChildren();$('#message-form button').disabled=false;$('#message-form button').textContent='Send reply';if(conversation.open) conversation.close();}
$('#close-conversation').addEventListener('click',closeConversation);
conversation.addEventListener('cancel',event=>{event.preventDefault();closeConversation();});
$('#older-messages').addEventListener('click',()=>loadMessages(true));
function openConversation(id) {
 const request=requests.find(row=>row.id===id);if(!request || !user || !role) return;
 closeConversation();threadId=id;
 $('#conversation-title').textContent='Pickup '+request.order;
 $('#original-note').innerHTML=`<article class="message original"><small>Original request · ${escapeHTML(request.name)} · ${escapeHTML(messageTime(request.created_at))}</small><p>${escapeHTML(request.notes || 'No note included with the request.')}</p></article>`;
 $('#older-messages').hidden=true;conversation.showModal();loadMessages();
}
$('#message-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!threadId || !role || sendingMessage) return;
 const field=event.currentTarget.elements.body, body=field.value.trim();if(!body || body.length>2000) return;
 const epoch=threadEpoch, auth=authEpoch, id=threadId;const button=$('#message-form button');sendingMessage=true;button.disabled=true;button.textContent='Sending…';
 try {
  const rows=await database('pickup_messages',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({request_id:id,body})});
  if(epoch!==threadEpoch || auth!==authEpoch) return;
  const merged=new Map(threadMessages.map(message=>[message.id,message]));for(const message of rows) merged.set(message.id,message);
  threadMessages=[...merged.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));renderMessages();field.value='';$('#message-list').scrollTop=$('#message-list').scrollHeight;$('#message-status').textContent='Reply sent.';
 } catch(error) {if(epoch===threadEpoch && auth===authEpoch) $('#message-status').textContent='Reply could not be confirmed. Your draft is kept; check for it in the thread before retrying.';}
 finally {if(epoch===threadEpoch) {sendingMessage=false;button.disabled=false;button.textContent='Send reply';}}
});
setInterval(()=>{if(!document.hidden && conversation.open && !sendingMessage) loadMessages();},15000);
function card(request, bear = false) {
  const statusNames = {pending:'Waiting for Bear',accepted:'Accepted',picked_up:'Picked Up',declined:'Declined',delivered:'Delivered',reschedule_required:'Choose another date',cancelled:'Cancelled'};
  let actions = '';
  if (bear && request.status === 'pending') actions = `<button data-action="accept" data-id="${escapeHTML(request.id)}">Accept pickup ✓</button><button data-action="decline" data-id="${escapeHTML(request.id)}">Decline</button>`;
  if (bear && request.status === 'picked_up') actions = `<button data-action="deliver" data-id="${escapeHTML(request.id)}">Mark delivered ✓</button>`;
  if (!bear && request.status === 'accepted') {
    actions = !window.BearDashDelivery && settings.venmo && /^[A-Za-z0-9_-]+$/.test(settings.venmo) ? `<a href="${escapeHTML(venmoLink(request))}">Open Venmo app · $5 ↗</a>` : (window.BearDashDelivery ? '' : '<button data-action="setup">Set Bear’s Venmo</button>');
    actions += settings.email && settings.bearName ? `<a href="${escapeHTML(emailLink(request))}">Compose store email ↗</a>` : '<button data-action="setup">Set pickup email & name</button>';
  }
  actions += `<button type="button" data-action="conversation" data-id="${escapeHTML(request.id)}">Conversation ↗</button>`;
  return `<article class="card"><div class="card-top"><h3>${escapeHTML(request.order)}</h3><span class="status ${escapeHTML(request.status)}">${statusNames[request.status] || 'Unknown'}</span></div><p>${escapeHTML(request.name)} · ${escapeHTML(dateLabel(request.date))}\n${escapeHTML(request.notes)}</p>${request.status === 'accepted' && !bear && !window.BearDashDelivery ? '<p>Open Venmo app requires Venmo installed. If it does not open, find @' + escapeHTML(settings.venmo) + ' in Venmo and enter $5 manually. Confirm the recipient before paying. Review and send the authorization from your own email account. These links do not confirm payment or email delivery.</p>' : ''}<div class="actions">${actions}</div></article>`;
}
function render() {
  $('#count').textContent = `${requests.length} request${requests.length === 1 ? '' : 's'}`;
  $('#badge').textContent = requests.filter(r => r.status === 'pending').length;
  const empty = '<div class="empty"><span>🐾</span>No pickups yet.<br>Your next game-night delivery starts here.</div>';
  const mine = requests.filter(r => r.user_id === user?.id);
  $('#count').textContent = `${mine.length} request${mine.length === 1 ? '' : 's'}`;
  $('#member-list').innerHTML = !role ? '<div class="empty">Sign in with an approved playgroup account to see pickups.</div>' : mine.length ? mine.map(r => card(r)).join('') : empty;
  $('#bear-list').innerHTML = role === 'bear' && requests.length ? requests.map(r => card(r,true)).join('') : empty;
  window.BearDashDelivery?.render();
}
const fieldset = document.createElement('fieldset');
while ($('#request-form').firstChild) fieldset.append($('#request-form').firstChild);
$('#request-form').append(fieldset);
function accountUI() {
 fieldset.disabled = !role || role === 'bear' || loading || (window.BearDashDelivery && (!window.BearDashDelivery.ready || !$('#dates').value));
 $('#auth-form').hidden = !!user;
 $('#signout').hidden = !user;
 $('#refresh').hidden = !user;
 $('[data-view="bear"]').hidden = role !== 'bear';
 $('.settings').hidden = role !== 'bear';
 for(const entry of menuLinks.querySelectorAll('[data-member-menu]')) entry.hidden = role === 'bear';
 menuLinks.querySelector('[data-bear-menu]').hidden = role !== 'bear';
 for(const tab of document.querySelectorAll('nav [data-view]')) tab.hidden = role === 'bear' ? tab.dataset.view !== 'bear' : tab.dataset.view === 'bear';
 if(activeView==='approvals' && !approvalState.can_approve) activeView=role==='bear'?'bear':'home';
 if(navigationRole !== role) {navigationRole=role;showView(role === 'bear' ? 'bear' : 'home',false);} else showView(activeView,false);
 $('#account-status').textContent = user ? `${user.email} · ${role === 'bear' ? 'Bear’s account' : role ? (approvalState.is_admin ? 'BearDash administrator' : 'BearDash member') : approvalState.own_status==='declined' ? 'Your membership request was declined. Contact BearDash support if this was unexpected.' : 'Awaiting group approval. Ask the organizer to approve your account.'}` : 'Sign in or create an account. New accounts need group approval.';
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
  if(threadId && !rows.some(row=>row.id===threadId)) closeConversation();
  const nameInput = $('#request-form').elements.name;
  if (!nameInput.value.trim()) nameInput.value = user.user_metadata?.pickup_name || rows.find(r => r.user_id === user.id)?.name || '';
  if(config[0]) settings = config[0];
  for (const field of ['venmo','email','bearName']) $('#settings-form').elements[field].value = settings[field] || '';
  $('#connection-status').textContent = role ? 'CONNECTED · Updates refresh about every 15 seconds while this page is open.' : 'ACCOUNT CONNECTED · Group approval is required.';
  await refreshApprovals();
  if(epoch!==authEpoch)return;
  await window.BearDashDelivery?.refresh();
  if(epoch!==authEpoch)return;
  render();
  if (manual) toast('Pickups refreshed.');
 } catch(error) {
  if(epoch !== authEpoch) return;
  if(error.reauthenticate || error.status===401) {endSession();$('#account-status').textContent='Your session has expired or was revoked. Please sign in again.';$('#connection-status').textContent='Please sign in again to reconnect.';return;}
  closeConversation();clearApprovals();window.BearDashDelivery?.reset();requests = []; role = null; syncError=error.message; render();
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
function endSession() {
 closeConversation();clearApprovals();window.BearDashDelivery?.reset();
 authEpoch++;loading=false;storeSession(null);user=null;role=null;requests=[];$('#request-form').reset();render();accountUI();$('#refresh').disabled=false;$('#refresh').textContent='Refresh pickups';
 $('#connection-status').textContent='Signed out. Sign in to connect to BearDash.';
}
$('#signout').addEventListener('click',()=>{
 const token=session?.access_token;endSession();
 if(token) api('/auth/v1/logout',{method:'POST'},token).catch(()=>{});
});
window.addEventListener('storage',event=>{
 if(event.key!==AUTH_KEY && event.key!==null)return;
 let updated=null;try {updated=readStoredSession(localStorage);}catch {}
 if(!updated) {if(session)endSession();return;}
 if(!session || (updated.user?.id && user?.id && updated.user.id!==user.id)) {location.reload();return;}
 // Token refreshes in another tab must not erase an unfinished request or message.
 session=updated;try{sessionStorage.setItem(AUTH_KEY,JSON.stringify(updated));}catch {}
});
window.addEventListener('online',()=>{if(session)sync();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden && session)sync();});
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
 if(window.BearDashDelivery) {
  fieldset.disabled=true;
  try {await window.BearDashDelivery.submit(form,data);}catch(error){toast(error.message);}finally{accountUI();}
  return;
 }
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
 if(button.dataset.action==='conversation') openConversation(button.dataset.id);
 if(button.dataset.action==='setup') {
  if(role === 'bear') { accountMenu.showModal();menuButton.setAttribute('aria-expanded','true');$('.settings').open=true;$('.settings').scrollIntoView({behavior:'smooth'}); }
  else toast('Ask Bear to set his pickup name and contact details.');
 }
 const transitions = {accept:'accepted',decline:'declined',deliver:'delivered'};
 if(transitions[button.dataset.action] && role==='bear' && window.BearDashDelivery) {await window.BearDashDelivery.orderAction(button.dataset.id,button.dataset.action);return;}
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
