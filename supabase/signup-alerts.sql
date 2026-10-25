-- Run ONCE. The final result contains a private notification key: do not share it.
begin;
create schema beardash_notifications;
revoke all on schema beardash_notifications from public,anon,authenticated;
create table beardash_notifications.config (
 id boolean primary key default true check(id),
 notification_key text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
insert into beardash_notifications.config(id) values(true);
create table beardash_notifications.queue (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table beardash_notifications.config enable row level security;
alter table beardash_notifications.queue enable row level security;
revoke all on all tables in schema beardash_notifications from public,anon,authenticated;
create function beardash_notifications.enqueue_signup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null then
  insert into beardash_notifications.queue(user_id) values(new.id) on conflict(user_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function beardash_notifications.enqueue_signup() from public,anon,authenticated;
create trigger beardash_signup_alert after insert or update of email_confirmed_at on auth.users
for each row execute function beardash_notifications.enqueue_signup();
-- Include confirmed accounts that already await approval.
insert into beardash_notifications.queue(user_id)
select u.id from auth.users u where u.email_confirmed_at is not null
and not exists(select 1 from public.group_members m where m.user_id=u.id)
on conflict(user_id) do nothing;
create function public.beardash_pending_alerts(alert_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if alert_key is null or not exists(select 1 from beardash_notifications.config where notification_key=alert_key) then
  raise exception 'Invalid notification credentials' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(row_to_json(t)) from (
  select q.id,u.email,q.created_at from beardash_notifications.queue q
  join auth.users u on u.id=q.user_id
  where q.sent_at is null and u.email_confirmed_at is not null
  and not exists(select 1 from public.group_members m where m.user_id=q.user_id)
  order by q.created_at limit 50
 ) t),'[]'::jsonb);
end; $$;
create function public.beardash_ack_alerts(alert_key text, alert_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if alert_key is null or not exists(select 1 from beardash_notifications.config where notification_key=alert_key) then
  raise exception 'Invalid notification credentials' using errcode='42501';
 end if;
 if coalesce(array_length(alert_ids,1),0)>50 then raise exception 'Too many alerts'; end if;
 update beardash_notifications.queue set sent_at=now() where id=any(alert_ids) and sent_at is null;
end; $$;
revoke all on function public.beardash_pending_alerts(text),public.beardash_ack_alerts(text,uuid[]) from public,anon,authenticated;
grant execute on function public.beardash_pending_alerts(text),public.beardash_ack_alerts(text,uuid[]) to anon;
commit;
-- Copy ONLY this result to Apps Script's BEARDASH_ALERT_KEY property.
select notification_key from beardash_notifications.config where id=true;
