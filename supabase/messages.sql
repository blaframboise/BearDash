-- Run ONCE after setup.sql. This leaves existing pickups and memberships intact.
begin;
create table public.pickup_messages (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.pickup_requests(id) on delete cascade,
 sender_id uuid not null default auth.uid() references auth.users(id),
 sender_role text not null default 'member' check (sender_role in ('member','bear')),
 body text not null check (length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index pickup_messages_thread on public.pickup_messages(request_id,created_at desc,id desc);
alter table public.pickup_messages enable row level security;
create policy "Participants read pickup messages" on public.pickup_messages for select to authenticated
using (public.is_member() and exists (
 select 1 from public.pickup_requests r where r.id = request_id
 and (r.user_id = (select auth.uid()) or public.is_bear())
));
create policy "Participants send own pickup messages" on public.pickup_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and public.is_member() and exists (
 select 1 from public.pickup_requests r where r.id = request_id
 and (r.user_id = (select auth.uid()) or public.is_bear())
));
-- The server supplies identity and role. Clients can insert only a request and body.
create function public.stamp_pickup_message() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.sender_id := auth.uid();
 select role into new.sender_role from public.group_members where user_id = auth.uid();
 new.created_at := now();
 return new;
end; $$;
revoke all on function public.stamp_pickup_message() from public;
create trigger stamp_pickup_message before insert on public.pickup_messages
for each row execute function public.stamp_pickup_message();
revoke all on public.pickup_messages from public,anon,authenticated;
grant select on public.pickup_messages to authenticated;
grant insert(request_id,body) on public.pickup_messages to authenticated;
commit;
