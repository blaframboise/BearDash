-- Run once in Supabase SQL Editor. No passwords or keys belong here.
begin;
create table public.group_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('member','bear'))
);
alter table public.group_members enable row level security;
create policy "Read own membership" on public.group_members for select to authenticated using (user_id = (select auth.uid()));
create function public.is_bear() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.group_members where user_id = (select auth.uid()) and role = 'bear');
$$;
revoke all on function public.is_bear() from public;
grant execute on function public.is_bear() to authenticated;
create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.group_members where user_id = (select auth.uid()));
$$;
revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;
create table public.pickup_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id),
 name text not null check (length(trim(name)) between 1 and 80),
 "order" text not null check (length(trim("order")) between 1 and 80),
 date date not null check (extract(isodow from date) in (1,5)),
 notes text not null default '' check (length(notes) <= 500),
 status text not null default 'pending' check (status in ('pending','accepted','declined','delivered')),
 created_at timestamptz not null default now()
);
create index pickup_requests_owner on public.pickup_requests(user_id,created_at desc);
alter table public.pickup_requests enable row level security;
create policy "Member own requests and Bear board" on public.pickup_requests for select to authenticated using (public.is_member() and (user_id = (select auth.uid()) or public.is_bear()));
create policy "Members request own pending pickup" on public.pickup_requests for insert to authenticated with check (public.is_member() and user_id = (select auth.uid()) and status = 'pending' and date >= (now() at time zone 'America/Detroit')::date and date <= (now() at time zone 'America/Detroit')::date + 28);
create policy "Bear updates requests" on public.pickup_requests for update to authenticated using (public.is_bear()) with check (public.is_bear());
create function public.check_pickup_transition() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.name is distinct from old.name or new."order" is distinct from old."order" or new.date is distinct from old.date or new.notes is distinct from old.notes or new.created_at is distinct from old.created_at then raise exception 'Only pickup status may change'; end if;
 if not ((old.status = 'pending' and new.status in ('accepted','declined')) or (old.status = 'accepted' and new.status = 'delivered')) then raise exception 'Invalid pickup status transition'; end if;
 return new;
end; $$;
create trigger pickup_status_transition before update on public.pickup_requests for each row execute function public.check_pickup_transition();
create table public.group_settings (
 id boolean primary key default true check (id),
 venmo text not null default 'Kris-Timchuck' check (venmo ~ '^[A-Za-z0-9_-]{1,80}$'),
 email text not null default 'gamersgauntletmi@gmail.com' check (length(email) between 3 and 254 and email like '%@%'),
 "bearName" text not null default '' check (length("bearName") <= 80)
);
insert into public.group_settings(id) values(true);
alter table public.group_settings enable row level security;
create policy "Members read group settings" on public.group_settings for select to authenticated using (public.is_member());
create policy "Bear edits group settings" on public.group_settings for update to authenticated using (public.is_bear()) with check (public.is_bear());
revoke all on public.group_members, public.pickup_requests, public.group_settings from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.group_members, public.pickup_requests, public.group_settings to authenticated;
grant insert on public.pickup_requests to authenticated;
grant update(status) on public.pickup_requests to authenticated;
grant update(venmo,email,"bearName") on public.group_settings to authenticated;
commit;
