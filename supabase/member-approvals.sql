-- Run ONCE after setup.sql and signup-alerts.sql. Existing members/roles are preserved.
begin;
create table public.beardash_administrators (
 user_id uuid primary key references public.group_members(user_id) on delete cascade
);
alter table public.beardash_administrators enable row level security;
revoke all on public.beardash_administrators from public,anon,authenticated;
create schema beardash_approvals;
revoke all on schema beardash_approvals from public,anon,authenticated;
create table beardash_approvals.decisions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 decision text not null check(decision in ('approved','declined')),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now()
);
alter table beardash_approvals.decisions enable row level security;
revoke all on beardash_approvals.decisions from public,anon,authenticated;
create function public.beardash_can_approve() returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_member() and (public.is_bear() or exists(
  select 1 from public.beardash_administrators where user_id=(select auth.uid())
 ));
$$;
revoke all on function public.beardash_can_approve() from public,anon,authenticated;
grant execute on function public.beardash_can_approve() to authenticated;
create function public.beardash_approval_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed boolean; administrator boolean; applicants jsonb; own_status text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 allowed := public.beardash_can_approve();
 administrator := exists(select 1 from public.beardash_administrators where user_id=auth.uid());
 own_status := case when public.is_member() then 'approved' else coalesce((
  select decision from beardash_approvals.decisions where user_id=auth.uid()
 ),'pending') end;
 applicants := '[]'::jsonb;
 if allowed then
  select coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) into applicants from (
   select u.id,u.email,u.created_at,u.email_confirmed_at
   from auth.users u where u.email_confirmed_at is not null
   and not exists(select 1 from public.group_members m where m.user_id=u.id)
   and not exists(select 1 from beardash_approvals.decisions d where d.user_id=u.id and d.decision='declined')
   order by u.email_confirmed_at,u.id
  ) t;
 end if;
 return jsonb_build_object('can_approve',allowed,'is_admin',administrator,'own_status',own_status,'pending',applicants);
end; $$;
create function public.beardash_review_member(applicant_id uuid, review_decision text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare applicant_email text;
begin
 if auth.uid() is null or not public.beardash_can_approve() then
  raise exception 'Only Bear or an administrator can approve members' using errcode='42501';
 end if;
 if review_decision is null or review_decision not in ('approved','declined') then
  raise exception 'Choose approve or decline';
 end if;
 -- Serialize simultaneous reviews of the same account. No client supplies a role.
 select email into applicant_email from auth.users
 where id=applicant_id and email_confirmed_at is not null for update;
 if not found then raise exception 'Confirmed applicant not found'; end if;
 if exists(select 1 from public.group_members where user_id=applicant_id) then
  return jsonb_build_object('result','already_member');
 end if;
 if exists(select 1 from beardash_approvals.decisions where user_id=applicant_id and decision='declined') then
  return jsonb_build_object('result','already_reviewed');
 end if;
 if review_decision='approved' then
  insert into public.group_members(user_id,role) values(applicant_id,'member');
 end if;
 insert into beardash_approvals.decisions(user_id,decision,reviewed_by)
 values(applicant_id,review_decision,auth.uid())
 on conflict(user_id) do update set decision=excluded.decision,reviewed_by=excluded.reviewed_by,reviewed_at=now();
 -- Stop any queued signup alert now that an authorized person reviewed it.
 update beardash_notifications.queue set sent_at=coalesce(sent_at,now()) where user_id=applicant_id;
 return jsonb_build_object('result',review_decision);
end; $$;
revoke all on function public.beardash_approval_state(),public.beardash_review_member(uuid,text) from public,anon,authenticated;
grant execute on function public.beardash_approval_state(),public.beardash_review_member(uuid,text) to authenticated;
-- Existing Gmail polling keeps its current key and excludes declined accounts.
create or replace function public.beardash_pending_alerts(alert_key text) returns jsonb
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
  and not exists(select 1 from beardash_approvals.decisions d where d.user_id=q.user_id and d.decision='declined')
  order by q.created_at limit 50
 ) t),'[]'::jsonb);
end; $$;
-- Bootstrap the organizer only. Browser clients cannot write this table.
do $$
begin
 insert into public.beardash_administrators(user_id)
 select u.id from auth.users u join public.group_members m on m.user_id=u.id
 where lower(u.email)=lower('benjamin.laframboise@gmail.com') and u.email_confirmed_at is not null;
 if not found then raise exception 'Organizer must already be a confirmed BearDash member. No changes were applied.'; end if;
end; $$;
commit;
select u.email, 'administrator' as access from public.beardash_administrators a join auth.users u on u.id=a.user_id;
