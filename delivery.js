'use strict';
// Run fees, scheduling, cancellation choices, refunds, and BearMail share one server snapshot.
window.BearDashDelivery = (() => {
  let state={runs:[],bookings:[],mail:[]},ready=false,fetching=false,busy=false,generation=0;
  let submissionId=crypto.randomUUID(),pendingAction=null,choiceBooking=null;
  const escape=escapeHTML;
  const runDate=day=>new Date(day+'T16:00:00Z').toLocaleDateString('en-US',{timeZone:'America/Detroit',weekday:'long',month:'long',day:'numeric'});
  const main=document.querySelector('main');
  const banner=document.createElement('section');banner.id='delivery-banner';banner.setAttribute('aria-live','polite');main.insertBefore(banner,main.firstChild);
  const mailScreen=document.createElement('section');mailScreen.id='bearmail';mailScreen.className='view';mailScreen.hidden=true;
  mailScreen.innerHTML='<div class="section-title"><div><p class="eyebrow">FROM BEAR, TO THE GROUP</p><h2>BearMail</h2></div><button type="button" data-delivery-action="refresh">Refresh</button></div><p class="muted">Announcements and pickup notices. Order conversations stay inside each pickup. No background phone alerts yet.</p><form id="mail-compose" class="panel" hidden><h3>Send an announcement to all members</h3><label>Subject<input name="title" required maxlength="150"></label><label>Message<textarea name="body" required maxlength="3000" rows="4"></textarea></label><button type="submit" class="primary">Send BearMail</button><p id="mail-compose-status" role="status"></p></form><div id="mail-list"></div>';
  const scheduleScreen=document.createElement('section');scheduleScreen.id='schedule';scheduleScreen.className='view';scheduleScreen.hidden=true;
  scheduleScreen.innerHTML='<div class="section-title"><h2>Pickup Schedule</h2><button type="button" data-delivery-action="refresh">Refresh</button></div><p class="muted">One $5 fee per member per run. Accept or decline pending orders before marking a run Picked Up. Canceling a run sends BearMail and offers affected members a refund or reschedule.</p><div id="schedule-list"></div>';
  const refundsScreen=document.createElement('section');refundsScreen.id='refunds';refundsScreen.className='view';refundsScreen.hidden=true;
  refundsScreen.innerHTML='<div class="section-title"><h2>Refund Requests</h2><button type="button" data-delivery-action="refresh">Refresh</button></div><p class="muted">Check the original payment and recipient in Venmo before returning $5. Opening Venmo does not mark a refund sent.</p><div id="refund-list"></div>';
  main.append(mailScreen,scheduleScreen,refundsScreen);
  const shortcuts={};
  for(const [id,label] of [['bearmail','BearMail'],['schedule','Pickup Schedule'],['refunds','Refund Requests']]) {
    const button=document.createElement('button');button.type='button';button.dataset.view=id;button.hidden=true;button.textContent=label;
    menuLinks.insertBefore(button,document.querySelector('#account-shortcut'));shortcuts[id]=button;
  }
  const bearTools=document.createElement('div');bearTools.className='actions bear-tools';bearTools.innerHTML='<button type="button" data-view="schedule">Pickup Schedule / Picked Up</button><button type="button" data-view="refunds">Refund Requests</button><button type="button" data-view="bearmail">BearMail</button>';
  document.querySelector('#bear').insertBefore(bearTools,document.querySelector('#bear-list'));
  const quote=document.createElement('div');quote.id='run-quote';quote.className='note';quote.setAttribute('aria-live','polite');
  document.querySelector('#request-form fieldset').insertBefore(quote,document.querySelector('#request-form .primary'));
  const actionDialog=document.createElement('dialog');actionDialog.id='delivery-action-dialog';actionDialog.setAttribute('aria-labelledby','delivery-action-title');
  actionDialog.innerHTML='<h2 id="delivery-action-title"></h2><p id="delivery-action-copy"></p><label id="cancel-reason-label" hidden>Reason for members (optional)<textarea id="cancel-reason" maxlength="500" rows="3"></textarea></label><p id="delivery-action-error" role="status" aria-live="polite"></p><div class="actions"><button type="button" id="delivery-action-confirm">Confirm</button><button type="button" id="delivery-action-cancel">Cancel</button></div>';
  const choiceDialog=document.createElement('dialog');choiceDialog.id='booking-choice-dialog';choiceDialog.setAttribute('aria-labelledby','booking-choice-title');
  choiceDialog.innerHTML='<div class="section-title"><h2 id="booking-choice-title">Choose a pickup plan</h2><button type="button" id="close-booking-choice">Close ×</button></div><p id="booking-choice-copy"></p><form id="booking-choice-form"><label>Your choice<select name="resolution"><option value="reschedule">Choose another date</option><option value="refund">Request $5 refund</option><option value="cancel_unpaid">I have not paid—cancel without refund</option></select></label><label id="new-day-label">New pickup date<select name="day"></select></label><div id="reschedule-paid-fields"><label class="checkbox-label"><input name="paid_reschedule" type="checkbox"> I already sent the $5 for the original run. Carry that payment report to the new date.</label></div><div id="refund-fields" hidden><label>Your Venmo username<input name="venmo" maxlength="81" placeholder="@YourUsername" autocomplete="off" pattern="@?[A-Za-z0-9_-]{1,80}"></label><label class="checkbox-label"><input name="paid" type="checkbox"> I confirm I paid $5 for this run and the username above is where Bear should send the refund.</label><p class="muted">One refund for this run, covering all its orders. Review your username before submitting. Bear sends the refund manually.</p></div><p id="booking-choice-error" role="status" aria-live="polite"></p><button type="submit" class="primary">Confirm choice</button></form>';
  document.body.append(actionDialog,choiceDialog);
  const rpc=(name,payload={})=>database('rpc/'+name,{method:'POST',body:JSON.stringify(payload)});
  const runFor=day=>state.runs.find(run=>run.day===day);
  const ordersFor=id=>requests.filter(request=>request.booking_id===id);
  const memberName=booking=>ordersFor(booking.id)[0]?.name || 'Member';
  const today=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p=type=>parts.find(part=>part.type===type).value;return `${p('year')}-${p('month')}-${p('day')}`;
  };
  function nextRuns(){return state.runs.filter(run=>run.day>=today()).sort((a,b)=>a.day.localeCompare(b.day));}
  function openDays(){return nextRuns().filter(run=>run.status==='open');}
  function feeLink(booking,refund=false){
    const recipient=refund?booking.refund_venmo:settings.venmo;
    const note=refund?`BearDash $5 refund · ${booking.run_day}`:`BearDash run ${booking.run_day} · ${memberName(booking)}`;
    return `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(recipient || '')}&amount=5.00&note=${encodeURIComponent(note)}`;
  }
  function reset(){
    generation++;ready=false;state={runs:[],bookings:[],mail:[]};choiceBooking=null;pendingAction=null;busy=false;fetching=false;
    if(actionDialog.open)actionDialog.close();if(choiceDialog.open)choiceDialog.close();
    document.querySelector('#booking-choice-form').reset();document.querySelector('#cancel-reason').value='';
    document.querySelector('#mail-compose').reset();document.querySelector('#mail-compose-status').textContent='';
    document.querySelector('#delivery-action-confirm').disabled=false;document.querySelector('#delivery-action-cancel').disabled=false;
    document.querySelector('#booking-choice-form button').disabled=false;
    for(const node of ['#mail-list','#schedule-list','#refund-list'])document.querySelector(node).replaceChildren();
    render();
  }
  async function refresh(){
    if(!role || !session){reset();return;}
    if(fetching || busy)return;
    const auth=authEpoch,version=generation;fetching=true;
    try{
      const data=await rpc('beardash_delivery_state');
      if(auth!==authEpoch || version!==generation)return;
      if(data?.version!==1 || !Array.isArray(data.runs) || !Array.isArray(data.bookings) || !Array.isArray(data.mail))throw Error('Unexpected run data');
      state=data;if(Array.isArray(data.orders))requests=data.orders;ready=true;
    }catch{
      if(auth!==authEpoch || version!==generation)return;
      ready=false;state={runs:[],bookings:[],mail:[]};
    }finally{if(version===generation){fetching=false;render();}}
  }
  function optionsFor(select,includeClosed=false){
    const previous=select.value;
    const days=includeClosed?nextRuns():openDays();
    const currentHTML=days.map(run=>`<option value="${run.day}" ${run.status==='open'?'':'disabled'}>${escape(runDate(run.day))}${run.status==='cancelled'?' — unavailable':run.status==='picked_up'?' — picked up; closed':''}</option>`).join('');
    if(select.innerHTML!==currentHTML){select.innerHTML=currentHTML;const valid=days.find(run=>run.day===previous && run.status==='open');select.value=valid?previous:(days.find(run=>run.status==='open')?.day || '');}
  }
  function updateQuote(){
    if(!ready){quote.textContent=role?'The pickup schedule is unavailable. Reconnect or refresh before requesting a run.':'Sign in to request a run.';return;}
    const date=document.querySelector('#dates').value;
    const existing=state.bookings.find(booking=>booking.user_id===user?.id && booking.run_day===date && ['active','needs_choice','refund_requested'].includes(booking.state));
    const closed=nextRuns().filter(run=>run.status==='picked_up' && run.day<date).at(-1);
    if(!date)quote.textContent='There are no open pickup dates right now. Watch BearMail for the next run.';
    else if(existing?.state==='active')quote.textContent=`This order shares your ${runDate(date)} run. No additional $5 fee. ${existing.payment_status==='unconfirmed'?'One $5 fee for the whole run is still due after acceptance.':'Your existing payment report or credit covers the run.'}`;
    else if(existing)quote.textContent='You already have a booking needing attention on this date. Resolve it in My Pickups, or choose another date.';
    else quote.textContent=`${closed?`Bear has already picked up for ${runDate(closed.day)}. `:''}Pickup: ${runDate(date)}. This is a separate $5 run. More orders can be added for no extra fee until Bear marks this run Picked Up.`;
  }
  function renderBooking(booking,bear=false){
    const orders=ordersFor(booking.id);const run=runFor(booking.run_day);let controls='';
    const hasAccepted=orders.some(order=>['accepted','picked_up','delivered'].includes(order.status));
    if(!bear && booking.state==='active' && hasAccepted){
      if(booking.payment_status==='unconfirmed')controls=`<a href="${escape(feeLink(booking))}">Open Venmo app · $5 ↗</a><button type="button" data-delivery-action="report-paid" data-booking="${booking.id}">I sent the $5</button>`;
      else controls=`<span class="payment-note">${booking.payment_status==='confirmed'?'Bear confirmed payment':'Payment reported—do not pay again'}</span>`;
    }
    if(bear && booking.state==='active' && booking.payment_status!=='confirmed' && hasAccepted)controls+=`<button type="button" data-delivery-action="confirm-paid" data-booking="${booking.id}">Confirm $5 received</button>`;
    if(!bear && booking.state==='needs_choice')controls+=`<button type="button" data-delivery-action="choose" data-booking="${booking.id}">Refund or choose another date</button>`;
    if(!bear && booking.state==='active' && run?.status==='open')controls+=`<button type="button" data-delivery-action="add-order" data-booking="${booking.id}">Add another order · no extra fee</button>`;
    const stateLabels={active:'$5 total for this member’s run',needs_choice:'Action needed: refund or reschedule',rescheduled:'Rescheduled / combined with another run',refund_requested:'$5 refund requested',refunded:'Bear marked $5 refund sent',cancelled_unpaid:'Cancelled—no payment reported'};
    return `<section class="run-booking"><div class="section-title"><div><p class="eyebrow">${bear?escape(memberName(booking)):'YOUR RUN'}</p><h3>${escape(runDate(booking.run_day))}</h3></div><span class="status">${escape(run?.status==='picked_up'?'Picked up':run?.status || '')}</span></div><p class="run-fee">${escape(stateLabels[booking.state] || booking.state)}</p>${booking.state==='needs_choice'?`<p class="attention-copy">Bear cannot deliver as originally expected. Would you like to request your $5 back and arrange another pickup, or choose another date? If you haven’t paid, cancel without a refund.</p>`:''}${booking.state==='refund_requested'?`<p class="muted">Refund destination: @${escape(booking.refund_venmo)}. Awaiting Bear’s manual transfer.</p>`:''}${booking.state==='refunded'?'<p class="muted">Check Venmo for the refund. BearDash does not verify the transfer.</p>':''}<div class="actions booking-actions">${controls}</div>${!bear && booking.state==='active' && hasAccepted?'<p class="muted">Pay once for this run, not once per order. Venmo requires the app; if needed, find @'+escape(settings.venmo)+' and pay $5 manually. Confirm the recipient. Payment reports are not automated verification.</p>':''}<div class="booking-orders">${orders.length?orders.map(order=>card(order,bear)).join(''):'<p class="muted">The orders in this booking moved to another run. Their conversations stay with the orders.</p>'}</div></section>`;
  }
  function render(){
    for(const [id,button]of Object.entries(shortcuts))button.hidden=!role || (id!=='bearmail' && role!=='bear');
    bearTools.hidden=role!=='bear';
    const unread=state.mail.filter(mail=>!mail.is_read).length;
    shortcuts.bearmail.textContent='BearMail'+(unread?' · '+unread:'');
    bearTools.querySelector('[data-view=bearmail]').textContent=shortcuts.bearmail.textContent;
    if(unread)menuButton.dataset.mailCount=String(unread);else delete menuButton.dataset.mailCount;
    const pending=approvalState.can_approve?approvalState.pending.length:0;menuButton.setAttribute('aria-label','Open account menu'+(pending?', '+pending+' pending member approvals':'')+(unread?', '+unread+' unread BearMail messages':''));
    shortcuts.refunds.textContent='Refund Requests'+(state.bookings.some(booking=>booking.state==='refund_requested')?' · pending':'');
    document.querySelector('#mail-compose').hidden=role!=='bear';
    if(!role){banner.replaceChildren();delete menuButton.dataset.mailCount;return;}
    if(!ready){banner.innerHTML='<div class="delivery-warning">The pickup schedule is temporarily unavailable. Refresh or check your connection. New requests and run payment controls are paused until it reconnects.</div>';for(const id of ['#mail-list','#schedule-list','#refund-list'])document.querySelector(id).innerHTML='<div class="empty">Temporarily unavailable. Please refresh to reconnect.</div>';updateQuote();return;}
    const cancelled=nextRuns().filter(run=>run.status==='cancelled');
    banner.innerHTML=cancelled.map(run=>`<div class="delivery-warning"><strong>ATTENTION: NO BEARDASH AVAILABLE ON ${escape(runDate(run.day).toUpperCase())}.</strong>${run.reason?'<p>'+escape(run.reason)+'</p>':''}<button type="button" data-view="bearmail">Read BearMail</button></div>`).join('');
    optionsFor(document.querySelector('#dates'),true);updateQuote();
    if(role!=='bear'){
      const bookings=state.bookings.filter(booking=>booking.user_id===user?.id);
      document.querySelector('#member-list').innerHTML=bookings.length?bookings.map(booking=>renderBooking(booking)).join(''):'<div class="empty">No pickups yet. Request your first run.</div>';
    }else{
      document.querySelector('#bear-list').innerHTML=state.bookings.length?state.bookings.map(booking=>renderBooking(booking,true)).join(''):'<div class="empty">No pickups yet.</div>';
    }
    document.querySelector('#mail-list').innerHTML=state.mail.length?state.mail.map(mail=>`<article class="card mail-card ${mail.is_read?'':'unread'}"><div class="section-title"><h3>${escape(mail.title)}</h3><span class="count">${mail.is_read?'Read':'Unread'}</span></div><small class="muted">${escape(messageTime(mail.created_at))}${mail.recipient_id?' · Pickup notice':' · All members'}</small><p>${escape(mail.body)}</p>${mail.is_read?'':`<button type="button" data-delivery-action="read-mail" data-mail="${mail.id}">Mark read</button>`}${mail.kind==='needs_choice' && role!=='bear'?'<button type="button" data-view="member">My Pickups →</button>':''}</article>`).join(''):'<div class="empty">No BearMail yet.</div>';
    if(role==='bear')renderBear();
    if(!loading)fieldset.disabled=role==='bear' || !document.querySelector('#dates').value;
  }
  function renderBear(){
    document.querySelector('#schedule-list').innerHTML=nextRuns().map(run=>{
      const orders=requests.filter(request=>request.date===run.day);const affected=state.bookings.filter(booking=>booking.run_day===run.day && booking.state==='active' && orders.some(order=>order.booking_id===booking.id && ['pending','accepted'].includes(order.status))).length;
      return `<article class="card"><div class="section-title"><h3>${escape(runDate(run.day))}</h3><span class="status">${escape(run.status==='picked_up'?'Picked Up':run.status)}</span></div><p class="muted">${affected} scheduled member${affected===1?'':'s'} · ${orders.filter(order=>order.status==='pending').length} pending orders</p><div class="actions">${run.status==='open'?`<button type="button" data-delivery-action="pickup-run" data-day="${run.day}">Mark run Picked Up</button><button type="button" data-delivery-action="cancel-run" data-day="${run.day}">Turn off this date</button>`:run.status==='cancelled'?`<button type="button" data-delivery-action="reopen-run" data-day="${run.day}">Make available again</button>`:'<span class="muted">Closed to new orders. Next-date orders need a new $5 run.</span>'}</div></article>`;
    }).join('');
    const refunds=state.bookings.filter(booking=>['refund_requested','refunded'].includes(booking.state));
    document.querySelector('#refund-list').innerHTML=refunds.length?refunds.map(booking=>`<article class="card"><h3>${escape(memberName(booking))} · ${escape(runDate(booking.run_day))}</h3><p>$5 to @${escape(booking.refund_venmo)}</p><p class="muted">${booking.state==='refunded'?'Marked sent '+escape(messageTime(booking.refund_sent_at)):'Requested '+escape(messageTime(booking.refund_requested_at))+'. Confirm the original payment before refunding.'}</p>${booking.state==='refund_requested'?`<div class="actions"><a href="${escape(feeLink(booking,true))}">Open Venmo to refund $5 ↗</a><button type="button" data-delivery-action="refund-sent" data-booking="${booking.id}">Mark refund sent</button></div>`:''}</article>`).join(''):'<div class="empty">No refund requests.</div>';
  }
  function openConfirmation(title,copy,callback,withReason=false){
    pendingAction=callback;document.querySelector('#delivery-action-title').textContent=title;document.querySelector('#delivery-action-copy').textContent=copy;
    document.querySelector('#cancel-reason-label').hidden=!withReason;document.querySelector('#cancel-reason').value='';document.querySelector('#delivery-action-error').textContent='';
    actionDialog.showModal();
  }
  function choiceFields(){
    const form=document.querySelector('#booking-choice-form'),refund=form.elements.resolution.value==='refund';
    document.querySelector('#new-day-label').hidden=form.elements.resolution.value!=='reschedule';document.querySelector('#reschedule-paid-fields').hidden=form.elements.resolution.value!=='reschedule';document.querySelector('#refund-fields').hidden=!refund;
    form.elements.venmo.required=refund;form.elements.paid.required=refund;form.elements.day.required=form.elements.resolution.value==='reschedule';
  }
  function openChoice(booking){
    choiceBooking=booking.id;const form=document.querySelector('#booking-choice-form');form.reset();
    document.querySelector('#booking-choice-title').textContent='Your run: '+runDate(booking.run_day);
    document.querySelector('#booking-choice-copy').textContent='Bear cannot deliver your order on '+runDate(booking.run_day)+' as originally expected. Would you like to request your $5 back and arrange another pickup, or choose another date to get your cards from Bear?';
    optionsFor(form.elements.day);form.elements.paid_reschedule.checked=booking.payment_status!=='unconfirmed';form.elements.paid_reschedule.disabled=booking.payment_status!=='unconfirmed';form.elements.resolution.querySelector('[value=cancel_unpaid]').disabled=booking.payment_status!=='unconfirmed';
    document.querySelector('#booking-choice-error').textContent='';choiceFields();choiceDialog.showModal();
  }
  async function mutation(work){
    if(!ready)throw Error('Run scheduling is not connected yet.');
    if(busy)throw Error('Please wait for the current change to finish.');
    busy=true;const auth=authEpoch,version=generation;
    try{await work();}finally{if(version===generation)busy=false;}
    if(auth===authEpoch && version===generation){await refresh();window.render();}
  }
  document.querySelector('#delivery-action-confirm').addEventListener('click',async()=>{
    if(!pendingAction || busy)return;const callback=pendingAction;const confirm=document.querySelector('#delivery-action-confirm'),cancel=document.querySelector('#delivery-action-cancel');confirm.disabled=true;cancel.disabled=true;
    try{await mutation(callback);if(actionDialog.open)actionDialog.close();pendingAction=null;}
    catch(error){document.querySelector('#delivery-action-error').textContent=error.message;}
    finally{confirm.disabled=false;cancel.disabled=false;}
  });
  document.querySelector('#delivery-action-cancel').addEventListener('click',()=>{if(!busy){pendingAction=null;actionDialog.close();}});
  actionDialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else pendingAction=null;});
  document.querySelector('#close-booking-choice').addEventListener('click',()=>{if(!busy){choiceBooking=null;choiceDialog.close();}});
  choiceDialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else choiceBooking=null;});
  document.querySelector('#booking-choice-form').elements.resolution.addEventListener('change',choiceFields);
  document.querySelector('#booking-choice-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!choiceBooking || busy)return;const form=event.currentTarget,data=new FormData(form),button=form.querySelector('button');button.disabled=true;
    try{await mutation(()=>rpc('beardash_resolve_booking',{booking_id:choiceBooking,resolution:data.get('resolution'),new_day:data.get('resolution')==='reschedule'?data.get('day'):null,venmo_username:data.get('resolution')==='refund'?data.get('venmo').trim():null,paid_confirmation:data.get('resolution')==='refund'?data.get('paid')==='on':data.get('paid_reschedule')==='on'}));choiceBooking=null;form.reset();choiceDialog.close();}
    catch(error){document.querySelector('#booking-choice-error').textContent=error.message;}
    finally{button.disabled=false;}
  });
  document.querySelector('#mail-compose').addEventListener('submit',async event=>{
    event.preventDefault();if(busy || role!=='bear')return;const form=event.currentTarget,data=new FormData(form),button=form.querySelector('button');button.disabled=true;
    try{await mutation(()=>rpc('beardash_send_mail',{mail_title:data.get('title').trim(),mail_body:data.get('body').trim()}));form.reset();document.querySelector('#mail-compose-status').textContent='BearMail sent to all members.';}
    catch(error){document.querySelector('#mail-compose-status').textContent=error.message;}
    finally{button.disabled=false;}
  });
  document.querySelector('#dates').addEventListener('change',updateQuote);
  document.querySelector('#request-form').addEventListener('input',()=>{submissionId=crypto.randomUUID();updateQuote();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-delivery-action]');if(!button)return;
    const action=button.dataset.deliveryAction,booking=state.bookings.find(item=>item.id===button.dataset.booking),day=button.dataset.day;
    if(action==='refresh'){await sync(true);return;}
    if(!ready){toast('Run scheduling is not connected yet.');return;}
    if(action==='choose' && booking){openChoice(booking);return;}
    if(action==='add-order' && booking){showView('request');document.querySelector('#dates').value=booking.run_day;updateQuote();return;}
    if(action==='read-mail'){
      button.disabled=true;try{await mutation(()=>rpc('beardash_read_mail',{message_id:button.dataset.mail}));}catch(error){toast(error.message);}finally{button.disabled=false;}return;
    }
    if(action==='report-paid' && booking)openConfirmation('Confirm you sent $5','Only continue after you have sent the single $5 run fee in Venmo. This report covers all orders in this run. BearDash cannot verify the payment.',()=>rpc('beardash_payment',{booking_id:booking.id,payment_action:'report_paid',sent_confirmation:false}));
    if(role!=='bear')return;
    if(action==='confirm-paid' && booking)openConfirmation('Confirm $5 received','Check Venmo first. This confirms one $5 payment for all of this member’s orders in the run.',()=>rpc('beardash_payment',{booking_id:booking.id,payment_action:'confirm_paid',sent_confirmation:false}));
    if(action==='refund-sent' && booking)openConfirmation('Mark $5 refund sent?','Confirm you already sent $5 in Venmo to @'+booking.refund_venmo+'. Opening Venmo alone does not send the refund. This will notify the member.',()=>rpc('beardash_payment',{booking_id:booking.id,payment_action:'refund_sent',sent_confirmation:true}));
    if(action==='pickup-run')openConfirmation('Picked up: '+runDate(day)+'?','All accepted orders will be marked Picked Up. This closes the entire run to additions. New orders need another available date and a separate $5 run. Resolve pending orders first.',()=>rpc('beardash_pickup_run',{target_day:day}));
    if(action==='cancel-run'){
      const affected=state.bookings.filter(item=>item.run_day===day && item.state==='active' && ordersFor(item.id).some(order=>['pending','accepted'].includes(order.status))).length;
      openConfirmation('Turn off '+runDate(day)+'?',`${affected} member${affected===1?'':'s'} currently scheduled. They will be offered a refund if paid, or a new date without an additional fee. You are responsible for sending requested refunds in Venmo. All members will see a cancellation banner and BearMail.`,()=>rpc('beardash_schedule_run',{target_day:day,available:false,expected_affected:affected,cancellation_reason:document.querySelector('#cancel-reason').value.trim()}),true);
    }
    if(action==='reopen-run')openConfirmation('Make '+runDate(day)+' available again?','This opens the date for new requests. Existing cancelled bookings will still need a member’s choice; they will not move automatically.',()=>rpc('beardash_schedule_run',{target_day:day,available:true,expected_affected:0,cancellation_reason:''}));
  });
  async function submit(form,data){
    if(!ready)throw Error('Run scheduling is not connected. Please wait for the database setup or reconnect.');
    const id=submissionId;
    await mutation(()=>rpc('beardash_submit_order',{request_id:id,run_day:data.get('date'),member_name:data.get('name').trim(),order_number:data.get('order').trim(),order_notes:data.get('notes').trim()}));
    form.reset();submissionId=crypto.randomUUID();document.querySelector('#request-form').elements.name.value=user?.user_metadata?.pickup_name || data.get('name').trim();
    optionsFor(document.querySelector('#dates'),true);updateQuote();showView('member');toast('Order sent. Your run has one $5 fee total.');
  }
  async function orderAction(requestId,action){
    const next={accept:'accepted',decline:'declined',deliver:'delivered'}[action];
    try{await mutation(()=>rpc('beardash_order_status',{order_id:requestId,next_status:next}));toast('Order updated.');}
    catch(error){toast(error.message);}
  }
  render();
  if(role && !loading)refresh().then(()=>window.render && window.render());
  return {get ready(){return ready;},refresh,reset,render,submit,orderAction};
})();
