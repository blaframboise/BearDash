-- Run ONCE after all existing migrations. No private keys are returned to the browser.
begin;
create schema beardash_push;
revoke all on schema beardash_push from public,anon,authenticated;
create table beardash_push.config (
 id boolean primary key default true check(id),
 public_key text,
 private_key text,
 dispatch_secret text not null default(gen_random_uuid()::text||gen_random_uuid()::text),
 last_wake_at timestamptz,
 last_dispatch_at timestamptz,
 check((public_key is null)=(private_key is null))
);
insert into beardash_push.config(id) values(true);
create table beardash_push.subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/[^#[:space:]]+$'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87,88}={0,2}$'),
 auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{22,24}={0,2}$'),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table beardash_push.jobs (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null,
 subscription_id uuid not null references beardash_push.subscriptions(id) on delete cascade,
 kind text not null check(kind in ('new_order','member_reply','refund_request','test')),
 source_id uuid,
 request_id uuid,
 created_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 attempts integer not null default 0,
 lease_id uuid,
 locked_until timestamptz,
 completed_at timestamptz,
 outcome text,
 last_status integer,
 unique(subscription_id,event_id)
);
create index beardash_push_pending on beardash_push.jobs(available_at,created_at) where completed_at is null;
alter table beardash_push.config enable row level security;
alter table beardash_push.subscriptions enable row level security;
alter table beardash_push.jobs enable row level security;
revoke all on all tables in schema beardash_push from public,anon,authenticated;
-- Called by event triggers and an optional one-minute scheduler. net is installed separately.
create function beardash_push.wake() returns void language plpgsql security definer set search_path='' as $$
declare cfg beardash_push.config;
begin
 if to_regnamespace('net') is null then return; end if;
 if not exists(select 1 from beardash_push.jobs j join beardash_push.subscriptions s on s.id=j.subscription_id
  join public.group_members m on m.user_id=s.user_id and m.role='bear'
  where s.enabled and j.completed_at is null and j.created_at>now()-interval '24 hours' and j.attempts<5 and j.available_at<=now() and (j.locked_until is null or j.locked_until<now())) then return; end if;
 update beardash_push.config set last_wake_at=clock_timestamp() where id=true and public_key is not null
 and (last_wake_at is null or last_wake_at<clock_timestamp()-interval '5 seconds') returning * into cfg;
 if not found then return; end if;
 execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=5000)'
 using 'https://bvokijnmogjmftkggbxn.supabase.co/functions/v1/beardash-push',
 jsonb_build_object('Content-Type','application/json','x-beardash-push-secret',cfg.dispatch_secret),
 jsonb_build_object('action','dispatch');
exception when others then
 -- The durable job remains queued; the minute scheduler retries after a wake failure.
 null;
end; $$;
create function beardash_push.enqueue(event_kind text, source uuid, related_request uuid default null, target_user uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare event uuid:=gen_random_uuid();
begin
 insert into beardash_push.jobs(event_id,subscription_id,kind,source_id,request_id)
 select event,s.id,event_kind,source,related_request from beardash_push.subscriptions s
 join public.group_members m on m.user_id=s.user_id and m.role='bear'
 where s.enabled and (target_user is null or s.user_id=target_user);
 perform beardash_push.wake();
end; $$;
create function beardash_push.order_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' then
  if tg_op='INSERT' then perform beardash_push.enqueue('new_order',new.id,new.id);
  elsif old.status is distinct from new.status or old.date is distinct from new.date then perform beardash_push.enqueue('new_order',new.id,new.id);
  end if;
 end if;
 return new;
end; $$;
create trigger beardash_push_new_order after insert or update of status,date on public.pickup_requests for each row execute function beardash_push.order_event();
create function beardash_push.reply_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.sender_role='member' and exists(select 1 from public.pickup_requests r where r.id=new.request_id and r.user_id=new.sender_id) then
  perform beardash_push.enqueue('member_reply',new.id,new.request_id);
 end if;
 return new;
end; $$;
create trigger beardash_push_member_reply after insert on public.pickup_messages for each row execute function beardash_push.reply_event();
create function beardash_push.refund_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='refund_requested' and old.state is distinct from new.state then perform beardash_push.enqueue('refund_request',new.id); end if;
 return new;
end; $$;
create trigger beardash_push_refund after update of state on public.delivery_bookings for each row execute function beardash_push.refund_event();
create function public.beardash_push_public_config() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.beardash_can_approve() then raise exception 'Bear or administrator access required' using errcode='42501'; end if;
 return (select jsonb_build_object('configured',public_key is not null,'public_key',public_key,'last_dispatch_at',last_dispatch_at) from beardash_push.config where id=true);
end; $$;
create function public.beardash_push_subscribe(push_endpoint text,p256dh_key text,auth_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare subscription_id uuid;
begin
 perform beardash_delivery.require_bear();
 if not exists(select 1 from beardash_push.config where public_key is not null) then raise exception 'The organizer must initialize the push service first'; end if;
 insert into beardash_push.subscriptions(user_id,endpoint,p256dh,auth_key) values(auth.uid(),push_endpoint,p256dh_key,auth_key)
 on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,enabled=true,updated_at=now()
 returning id into subscription_id;
 return subscription_id;
end; $$;
create function public.beardash_push_unsubscribe(push_endpoint text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 update beardash_push.jobs j set completed_at=now(),outcome='disabled',locked_until=null,lease_id=null
 where j.completed_at is null and exists(select 1 from beardash_push.subscriptions s where s.id=j.subscription_id and s.user_id=auth.uid() and s.endpoint=push_endpoint);
 update beardash_push.subscriptions set enabled=false,updated_at=now() where user_id=auth.uid() and endpoint=push_endpoint;
end; $$;
create function public.beardash_push_subscription(push_endpoint text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 perform beardash_delivery.require_bear();
 return exists(select 1 from beardash_push.subscriptions where user_id=auth.uid() and endpoint=push_endpoint and enabled);
end; $$;
create function public.beardash_push_test() returns void language plpgsql security definer set search_path='' as $$
begin
 perform beardash_delivery.require_bear();
 if not exists(select 1 from beardash_push.subscriptions where user_id=auth.uid() and enabled) then raise exception 'Enable notifications on a device first'; end if;
 if (select count(*) from beardash_push.jobs j join beardash_push.subscriptions s on s.id=j.subscription_id where s.user_id=auth.uid() and j.kind='test' and j.created_at>now()-interval '1 minute')>=5 then raise exception 'Wait a minute before sending another test'; end if;
 perform beardash_push.enqueue('test',gen_random_uuid(),null,auth.uid());
end; $$;
-- Only the Edge Function's service role can generate/store keys or operate the queue.
create function public.beardash_push_worker_config() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(c) from beardash_push.config c where id=true;
$$;
create function public.beardash_push_bootstrap(vapid_public text,vapid_private text) returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if vapid_public is null or vapid_private is null or vapid_public !~ '^[A-Za-z0-9_-]{87}$' or vapid_private !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid VAPID key pair'; end if;
 update beardash_push.config set public_key=vapid_public,private_key=vapid_private where id=true and public_key is null;
 select public_key into result from beardash_push.config where id=true;
 return result;
end; $$;
create function public.beardash_push_claim(batch_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare claimed jsonb;
begin
 update beardash_push.config set last_dispatch_at=now() where id=true;
 delete from beardash_push.jobs where completed_at<now()-interval '30 days';
 update beardash_push.jobs set completed_at=now(),outcome='failed',locked_until=null,lease_id=null where completed_at is null and attempts>=5 and (locked_until is null or locked_until<now());
 update beardash_push.jobs j set completed_at=now(),outcome=case when j.created_at<now()-interval '24 hours' then 'expired' else 'disabled' end,locked_until=null,lease_id=null
 where j.completed_at is null and (j.created_at<now()-interval '24 hours' or not exists(
  select 1 from beardash_push.subscriptions s join public.group_members m on m.user_id=s.user_id and m.role='bear' where s.id=j.subscription_id and s.enabled));
 with selected as (
  select j.id from beardash_push.jobs j where j.completed_at is null and j.attempts<5 and j.available_at<=now() and (j.locked_until is null or j.locked_until<now())
  order by j.created_at,j.id limit greatest(1,least(coalesce(batch_size,20),50)) for update skip locked
 ), leased as (
  update beardash_push.jobs j set attempts=attempts+1,lease_id=gen_random_uuid(),locked_until=now()+interval '3 minutes'
  from selected x where j.id=x.id returning j.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_id',j.lease_id,'kind',j.kind,'request_id',j.request_id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth_key',s.auth_key,'attempts',j.attempts)),'[]'::jsonb)
 into claimed from leased j join beardash_push.subscriptions s on s.id=j.subscription_id;
 return claimed;
end; $$;
create function public.beardash_push_finish(job_id uuid,job_lease uuid,delivered boolean,status_code integer default null,retry_seconds integer default 60) returns void
language plpgsql security definer set search_path='' as $$
declare j beardash_push.jobs; gone boolean:=coalesce(status_code in (404,410),false);
begin
 select * into j from beardash_push.jobs where id=job_id and lease_id=job_lease and completed_at is null for update;
 if not found then return; end if;
 update beardash_push.jobs set completed_at=case when delivered is true or gone or attempts>=5 then now() else null end,
 outcome=case when delivered is true then 'sent' when gone then 'gone' when attempts>=5 then 'failed' else null end,
 last_status=status_code,available_at=now()+make_interval(secs=>greatest(30,least(coalesce(retry_seconds,60),3600))),locked_until=null,lease_id=null where id=j.id;
 if gone then
  update beardash_push.subscriptions set enabled=false,updated_at=now() where id=j.subscription_id;
  update beardash_push.jobs set completed_at=now(),outcome='gone',locked_until=null,lease_id=null where subscription_id=j.subscription_id and completed_at is null;
 end if;
end; $$;
revoke all on all functions in schema beardash_push from public,anon,authenticated;
revoke all on function public.beardash_push_public_config(),public.beardash_push_subscribe(text,text,text),public.beardash_push_unsubscribe(text),public.beardash_push_subscription(text),public.beardash_push_test(),public.beardash_push_worker_config(),public.beardash_push_bootstrap(text,text),public.beardash_push_claim(integer),public.beardash_push_finish(uuid,uuid,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.beardash_push_public_config(),public.beardash_push_subscribe(text,text,text),public.beardash_push_unsubscribe(text),public.beardash_push_subscription(text),public.beardash_push_test() to authenticated;
grant execute on function public.beardash_push_worker_config(),public.beardash_push_bootstrap(text,text),public.beardash_push_claim(integer),public.beardash_push_finish(uuid,uuid,boolean,integer,integer) to service_role;
commit;
select 'Push database installed; deploy the Edge Function next' as result;
