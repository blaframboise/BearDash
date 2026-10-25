-- Run ONCE after the previous BearDash migrations. Existing pickups/messages are preserved.
begin;
create schema beardash_delivery;
revoke all on schema beardash_delivery from public,anon,authenticated;
create table public.delivery_runs (
 day date primary key check(extract(isodow from day) in (1,5)),
 status text not null default 'open' check(status in ('open','picked_up','cancelled')),
 reason text not null default '' check(length(reason)<=500),
 changed_at timestamptz not null default now()
);
create table public.delivery_bookings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 run_day date not null references public.delivery_runs(day),
 state text not null default 'active' check(state in ('active','needs_choice','rescheduled','refund_requested','refunded','cancelled_unpaid')),
 payment_status text not null default 'unconfirmed' check(payment_status in ('unconfirmed','reported','confirmed')),
 refund_venmo text check(refund_venmo ~ '^[A-Za-z0-9_-]{1,80}$'),
 refund_requested_at timestamptz,
 refund_sent_at timestamptz,
 refund_sent_by uuid references auth.users(id),
 moved_to uuid references public.delivery_bookings(id),
 created_at timestamptz not null default now()
);
create unique index delivery_booking_current on public.delivery_bookings(user_id,run_day) where state in ('active','needs_choice','refund_requested');
create table public.bearmail (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 150),
 body text not null check(length(trim(body)) between 1 and 3000),
 recipient_id uuid references auth.users(id), -- null means all approved members
 run_day date references public.delivery_runs(day),
 kind text not null default 'announcement',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.bearmail_reads (
 mail_id uuid not null references public.bearmail(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(mail_id,user_id)
);
drop trigger pickup_status_transition on public.pickup_requests;
insert into public.delivery_runs(day) select distinct date from public.pickup_requests;
insert into public.delivery_bookings(user_id,run_day) select distinct user_id,date from public.pickup_requests;
alter table public.pickup_requests add column booking_id uuid references public.delivery_bookings(id);
update public.pickup_requests r set booking_id=b.id from public.delivery_bookings b where b.user_id=r.user_id and b.run_day=r.date;
alter table public.pickup_requests alter column booking_id set not null;
alter table public.pickup_requests drop constraint pickup_requests_status_check;
alter table public.pickup_requests add constraint pickup_requests_status_check check(status in ('pending','accepted','picked_up','delivered','declined','reschedule_required','cancelled'));
create index pickup_requests_booking on public.pickup_requests(booking_id);
create index bearmail_recent on public.bearmail(created_at desc,id);
-- All order mutations now go through locked RPCs. Clients cannot bypass the cutoff or fee grouping.
revoke insert,update,delete on public.pickup_requests from public,anon,authenticated;
revoke update(status) on public.pickup_requests from public,anon,authenticated;
alter table public.delivery_runs enable row level security;
alter table public.delivery_bookings enable row level security;
alter table public.bearmail enable row level security;
alter table public.bearmail_reads enable row level security;
revoke all on public.delivery_runs,public.delivery_bookings,public.bearmail,public.bearmail_reads from public,anon,authenticated;
create policy "Members see schedule" on public.delivery_runs for select to authenticated using(public.is_member());
create policy "Own bookings or Bear" on public.delivery_bookings for select to authenticated using(public.is_member() and (user_id=auth.uid() or public.is_bear()));
create policy "BearMail recipients" on public.bearmail for select to authenticated using(public.is_member() and (recipient_id is null or recipient_id=auth.uid() or public.is_bear()));
create policy "Own BearMail read status" on public.bearmail_reads for select to authenticated using(public.is_member() and user_id=auth.uid());
grant select on public.delivery_runs,public.delivery_bookings,public.bearmail,public.bearmail_reads to authenticated;
-- Private helpers. Every mutation uses one transaction lock; this small-group app
-- serializes cancellation, order submission, rescheduling, and refund decisions.
create function beardash_delivery.require_member() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_member() then raise exception 'Approved membership required' using errcode='42501'; end if;
end; $$;
create function beardash_delivery.require_bear() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_bear() then raise exception 'Only Bear can do this' using errcode='42501'; end if;
end; $$;
create function beardash_delivery.valid_day(target_day date) returns void language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Detroit')::date;
begin
 if target_day is null or extract(isodow from target_day) not in (1,5) or target_day<today or target_day>today+56 then
  raise exception 'Choose a Monday or Friday in the next eight weeks';
 end if;
end; $$;
create function beardash_delivery.notice(recipient uuid, heading text, content text, target_day date, category text) returns void
language sql security definer set search_path='' as $$
 insert into public.bearmail(recipient_id,title,body,run_day,kind,created_by) values(recipient,heading,content,target_day,category,auth.uid());
$$;
create function public.beardash_delivery_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Detroit')::date; result jsonb;
begin
 perform beardash_delivery.require_member();
 select jsonb_build_object(
  'version',1,
  'orders',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id) from public.pickup_requests p where p.user_id=auth.uid() or public.is_bear()),'[]'::jsonb),
  'runs',coalesce((select jsonb_agg(row_to_json(t) order by day) from (
   select coalesce(r.day,d.day::date) as day,coalesce(r.status,'open') as status,coalesce(r.reason,'') as reason
   from public.delivery_runs r full join (
    select g as day from generate_series(today::timestamp,(today+56)::timestamp,interval '1 day') g where extract(isodow from g) in (1,5)
   ) d on r.day=d.day::date
  ) t),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(row_to_json(t) order by run_day desc) from (
   select b.* from public.delivery_bookings b where b.user_id=auth.uid() or public.is_bear()
  ) t),'[]'::jsonb),
  'mail',coalesce((select jsonb_agg(row_to_json(t) order by created_at desc,id desc) from (
   select m.*,exists(select 1 from public.bearmail_reads x where x.mail_id=m.id and x.user_id=auth.uid()) as is_read
   from public.bearmail m where m.recipient_id is null or m.recipient_id=auth.uid() or public.is_bear()
  ) t),'[]'::jsonb)
 ) into result;
 return result;
end; $$;
create function public.beardash_submit_order(request_id uuid, run_day date, member_name text, order_number text, order_notes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare booking public.delivery_bookings; run public.delivery_runs; existing public.pickup_requests;
begin
 perform beardash_delivery.require_member();
 if public.is_bear() then raise exception 'Bear uses the delivery dashboard'; end if;
 perform pg_advisory_xact_lock(95381266);
 select * into existing from public.pickup_requests where id=request_id;
 if found then
  if existing.user_id<>auth.uid() then raise exception 'Request identifier unavailable'; end if;
  return jsonb_build_object('booking_id',existing.booking_id,'request_id',existing.id,'already_saved',true);
 end if;
 perform beardash_delivery.valid_day(run_day);
 if request_id is null or member_name is null or length(trim(member_name)) not between 1 and 80 or order_number is null or length(trim(order_number)) not between 1 and 80 or length(coalesce(order_notes,''))>500 then raise exception 'Enter a name, order number, and a note of up to 500 characters'; end if;
 insert into public.delivery_runs(day) values(run_day) on conflict do nothing;
 select * into run from public.delivery_runs where day=run_day;
 if run.status<>'open' then raise exception 'Bear has closed or cancelled this run. Choose the next available date; it is a separate $5 run.'; end if;
 select b.* into booking from public.delivery_bookings b where b.user_id=auth.uid() and b.run_day=beardash_submit_order.run_day and b.state in ('active','needs_choice','refund_requested');
 if not found then
  insert into public.delivery_bookings(user_id,run_day) values(auth.uid(),run_day) returning * into booking;
 elsif booking.state<>'active' then raise exception 'Resolve the existing booking for this date before adding an order'; end if;
 insert into public.pickup_requests(id,user_id,name,"order",date,notes,status,booking_id)
 values(request_id,auth.uid(),trim(member_name),trim(order_number),run_day,coalesce(trim(order_notes),''),'pending',booking.id);
 return jsonb_build_object('booking_id',booking.id,'request_id',request_id,'fee_cents',500);
end; $$;
create function public.beardash_order_status(order_id uuid, next_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.pickup_requests; run_status text; b public.delivery_bookings;
begin
 perform beardash_delivery.require_bear();perform pg_advisory_xact_lock(95381266);
 select * into r from public.pickup_requests where id=order_id;
 if not found then raise exception 'Pickup not found'; end if;
 select status into run_status from public.delivery_runs where day=r.date;
 if not ((r.status='pending' and next_status in ('accepted','declined') and run_status='open') or (r.status='picked_up' and next_status='delivered' and run_status='picked_up')) then raise exception 'This order changed. Refresh before continuing'; end if;
 update public.pickup_requests set status=next_status where id=order_id;
 select * into b from public.delivery_bookings where id=r.booking_id;
 if next_status='declined' and b.state='active' and not exists(select 1 from public.pickup_requests where booking_id=b.id and status in ('pending','accepted','picked_up','delivered')) then
  update public.delivery_bookings set state='needs_choice' where id=b.id;
  perform beardash_delivery.notice(b.user_id,'Your pickup needs a new plan','Bear declined the orders in this run. Choose another date, request a $5 refund if you paid, or cancel without a refund if you have not paid.',b.run_day,'needs_choice');
 end if;
end; $$;
create function public.beardash_pickup_run(target_day date) returns void language plpgsql security definer set search_path='' as $$
begin
 perform beardash_delivery.require_bear();perform pg_advisory_xact_lock(95381266);
 perform beardash_delivery.valid_day(target_day);
 insert into public.delivery_runs(day) values(target_day) on conflict do nothing;
 if (select status from public.delivery_runs where day=target_day)<>'open' then raise exception 'This run is already closed or cancelled'; end if;
 if exists(select 1 from public.pickup_requests where date=target_day and status='pending') then raise exception 'Accept or decline all pending orders before marking the run picked up'; end if;
 update public.delivery_runs set status='picked_up',changed_at=now() where day=target_day;
 update public.pickup_requests set status='picked_up' where date=target_day and status='accepted';
 perform beardash_delivery.notice(null,'Bear has picked up for '||to_char(target_day,'FMDay, FMMonth DD'),'This run is closed to additional orders. New orders need the next available date and a new $5 fee per member.',target_day,'picked_up');
end; $$;
create function public.beardash_schedule_run(target_day date, available boolean, expected_affected integer, cancellation_reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_status text; affected integer; b record; date_text text;
begin
 perform beardash_delivery.require_bear();perform pg_advisory_xact_lock(95381266);perform beardash_delivery.valid_day(target_day);
 if available is null or length(coalesce(cancellation_reason,''))>500 then raise exception 'Invalid schedule change'; end if;
 insert into public.delivery_runs(day) values(target_day) on conflict do nothing;
 select status into current_status from public.delivery_runs where day=target_day;
 if current_status='picked_up' then raise exception 'A picked-up run cannot be cancelled or reopened'; end if;
 if (available and current_status='open') or (not available and current_status='cancelled') then return jsonb_build_object('already_set',true); end if;
 select count(*) into affected from public.delivery_bookings x where x.run_day=target_day and x.state='active' and exists(select 1 from public.pickup_requests p where p.booking_id=x.id and p.status in ('pending','accepted'));
 if not available and expected_affected is distinct from affected then raise exception 'The number of affected members changed. Refresh and review the cancellation again'; end if;
 date_text:=to_char(target_day,'FMDay, FMMonth DD');
 if available then
  update public.delivery_runs set status='open',reason='',changed_at=now() where day=target_day;
  perform beardash_delivery.notice(null,'BearDash available again on '||date_text,'This date is open again. If you had a cancelled booking, choose a date in My Pickups; existing bookings are not moved automatically.',target_day,'reopened');
 else
  update public.delivery_runs set status='cancelled',reason=coalesce(trim(cancellation_reason),''),changed_at=now() where day=target_day;
  perform beardash_delivery.notice(null,'ATTENTION: NO BEARDASH AVAILABLE ON '||upper(date_text),'Bear cannot make this run.'||case when trim(coalesce(cancellation_reason,''))<>'' then ' '||trim(cancellation_reason) else '' end||' Members with scheduled pickups can choose another date or request a refund if they paid.',target_day,'cancellation');
  for b in select x.* from public.delivery_bookings x where x.run_day=target_day and x.state='active' and exists(select 1 from public.pickup_requests p where p.booking_id=x.id and p.status in ('pending','accepted')) loop
   update public.delivery_bookings set state='needs_choice' where id=b.id;
   update public.pickup_requests set status='reschedule_required' where booking_id=b.id and status in ('pending','accepted');
   perform beardash_delivery.notice(b.user_id,'Your pickup on '||date_text||' needs attention','Bear cannot deliver your order on '||date_text||' as originally expected. Would you like to request your $5 back and arrange another pickup, or choose another date for Bear to deliver your cards? Open My Pickups to choose. If you have not paid, you can cancel without a refund.',target_day,'needs_choice');
  end loop;
 end if;
 return jsonb_build_object('affected_members',affected);
end; $$;
create function public.beardash_resolve_booking(booking_id uuid, resolution text, new_day date default null, venmo_username text default null, paid_confirmation boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare source public.delivery_bookings; target public.delivery_bookings; handle text; bear record; date_text text;
begin
 perform beardash_delivery.require_member();perform pg_advisory_xact_lock(95381266);
 select * into source from public.delivery_bookings where id=booking_id and user_id=auth.uid();
 if not found or source.state<>'needs_choice' then raise exception 'This booking is not awaiting your choice. Refresh the page'; end if;
 date_text:=to_char(source.run_day,'FMDay, FMMonth DD');
 if resolution='refund' then
  handle:=regexp_replace(trim(coalesce(venmo_username,'')),'^@','');
  if paid_confirmation is distinct from true or handle !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'Confirm you paid $5 and enter your Venmo username'; end if;
  update public.delivery_bookings set state='refund_requested',refund_venmo=handle,refund_requested_at=now(),payment_status=case when payment_status='unconfirmed' then 'reported' else payment_status end where id=source.id;
  update public.pickup_requests set status='cancelled' where pickup_requests.booking_id=source.id and status='reschedule_required';
  for bear in select user_id from public.group_members where role='bear' loop
   perform beardash_delivery.notice(bear.user_id,'$5 refund requested','A member requested a $5 refund for '||date_text||'. Open Refund Requests to review the payment and Venmo recipient before sending.',source.run_day,'refund_requested');
  end loop;
 elsif resolution='cancel_unpaid' then
  if source.payment_status<>'unconfirmed' then raise exception 'Payment was reported for this run. Choose a refund or reschedule'; end if;
  update public.delivery_bookings set state='cancelled_unpaid' where id=source.id;
  update public.pickup_requests set status='cancelled' where pickup_requests.booking_id=source.id and status='reschedule_required';
  perform beardash_delivery.notice(source.user_id,'Pickup cancelled without refund','You indicated you had not paid for '||date_text||'. Your pickup was cancelled and no refund is owed.',source.run_day,'cancelled_unpaid');
 elsif resolution='reschedule' then
  if paid_confirmation is true and source.payment_status='unconfirmed' then
   source.payment_status:='reported';
   update public.delivery_bookings set payment_status='reported' where id=source.id;
  end if;
  perform beardash_delivery.valid_day(new_day);
  insert into public.delivery_runs(day) values(new_day) on conflict do nothing;
  if (select status from public.delivery_runs where day=new_day)<>'open' then raise exception 'That date is unavailable or already picked up. Choose another date'; end if;
  select * into target from public.delivery_bookings b where b.user_id=auth.uid() and b.run_day=new_day and b.state in ('active','needs_choice','refund_requested');
  if found and target.id=source.id then
   update public.delivery_bookings set state='active' where id=source.id;
  else
   if not found then
    insert into public.delivery_bookings(user_id,run_day,payment_status) values(auth.uid(),new_day,source.payment_status) returning * into target;
   else
    if target.state<>'active' then raise exception 'Resolve the other booking for this date first'; end if;
    if source.payment_status<>'unconfirmed' and target.payment_status<>'unconfirmed' then raise exception 'You already have a paid booking on this date. Request a refund for the cancelled run or choose a different date so no payment credit is lost'; end if;
    if source.payment_status<>'unconfirmed' then update public.delivery_bookings set payment_status=source.payment_status where id=target.id; end if;
   end if;
   update public.delivery_bookings set state='rescheduled',moved_to=target.id where id=source.id;
  end if;
  -- Retain request IDs and conversations; even a declined order may be proposed again.
  update public.pickup_requests set booking_id=target.id,date=new_day,status='pending' where pickup_requests.booking_id=source.id and status in ('reschedule_required','declined');
  perform beardash_delivery.notice(source.user_id,'Your pickup was rescheduled','Your orders moved to '||to_char(new_day,'FMDay, FMMonth DD')||' and await Bear’s acceptance. There is no additional fee for rescheduling. Any existing payment credit was carried forward; if you have not paid yet, the single $5 run fee is still due after acceptance.',new_day,'rescheduled');
 else raise exception 'Choose refund, reschedule, or cancel without payment';
 end if;
end; $$;
create function public.beardash_payment(booking_id uuid, payment_action text, sent_confirmation boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare b public.delivery_bookings;
begin
 perform beardash_delivery.require_member();perform pg_advisory_xact_lock(95381266);
 select * into b from public.delivery_bookings where id=booking_id;
 if not found then raise exception 'Booking not found'; end if;
 if payment_action='report_paid' and b.user_id=auth.uid() and b.state='active' then
  if not exists(select 1 from public.pickup_requests p where p.booking_id=b.id and p.status in ('accepted','picked_up','delivered')) then raise exception 'Wait for Bear to accept an order before paying'; end if;
  update public.delivery_bookings set payment_status=case when payment_status='confirmed' then 'confirmed' else 'reported' end where id=b.id;
 elsif payment_action='confirm_paid' and public.is_bear() and b.state in ('active','needs_choice') then
  update public.delivery_bookings set payment_status='confirmed' where id=b.id;
 elsif payment_action='refund_sent' and public.is_bear() and b.state='refund_requested' and sent_confirmation then
  update public.delivery_bookings set state='refunded',refund_sent_at=now(),refund_sent_by=auth.uid() where id=b.id;
  perform beardash_delivery.notice(b.user_id,'Bear marked your $5 refund sent','Bear marked your refund for '||to_char(b.run_day,'FMDay, FMMonth DD')||' as sent to @'||b.refund_venmo||'. Check Venmo to confirm receipt. BearDash cannot verify the transfer.',b.run_day,'refund_sent');
 else raise exception 'This payment action is not allowed or has already been completed' using errcode='42501';
 end if;
end; $$;
create function public.beardash_send_mail(mail_title text, mail_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform beardash_delivery.require_bear();
 perform beardash_delivery.notice(null,trim(mail_title),trim(mail_body),null,'announcement');
end; $$;
create function public.beardash_read_mail(message_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform beardash_delivery.require_member();
 if not exists(select 1 from public.bearmail where id=message_id and (recipient_id is null or recipient_id=auth.uid() or public.is_bear())) then raise exception 'Message not found' using errcode='42501'; end if;
 insert into public.bearmail_reads(mail_id,user_id) values(message_id,auth.uid()) on conflict do nothing;
end; $$;
revoke all on all functions in schema beardash_delivery from public,anon,authenticated;
revoke all on function public.beardash_delivery_state(),public.beardash_submit_order(uuid,date,text,text,text),public.beardash_order_status(uuid,text),public.beardash_pickup_run(date),public.beardash_schedule_run(date,boolean,integer,text),public.beardash_resolve_booking(uuid,text,date,text,boolean),public.beardash_payment(uuid,text,boolean),public.beardash_send_mail(text,text),public.beardash_read_mail(uuid) from public,anon,authenticated;
grant execute on function public.beardash_delivery_state(),public.beardash_submit_order(uuid,date,text,text,text),public.beardash_order_status(uuid,text),public.beardash_pickup_run(date),public.beardash_schedule_run(date,boolean,integer,text),public.beardash_resolve_booking(uuid,text,date,text,boolean),public.beardash_payment(uuid,text,boolean),public.beardash_send_mail(text,text),public.beardash_read_mail(uuid) to authenticated;
commit;
select 'Delivery runs, BearMail, and refunds installed' as result;
