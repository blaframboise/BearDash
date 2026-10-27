-- Run after delivery-runs.sql and messages.sql. Preserves existing orders.
begin;
alter table public.pickup_requests add column if not exists member_received_at timestamptz;
create or replace function public.beardash_edit_order(order_id uuid, expected_order text, expected_notes text, order_number text, order_notes text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.pickup_requests;
begin
 perform beardash_delivery.require_member(); perform pg_advisory_xact_lock(95381266);
 select * into r from public.pickup_requests where id=order_id and user_id=auth.uid();
 if not found then raise exception 'Order not found for your account'; end if;
 if r.status not in ('pending','accepted') or not exists(select 1 from public.delivery_runs where day=r.date and status='open') or not exists(select 1 from public.delivery_bookings where id=r.booking_id and state='active') then raise exception 'This order can no longer be edited. Send Bear a message instead.'; end if;
 if r."order" is distinct from expected_order or r.notes is distinct from expected_notes then raise exception 'This order changed. Refresh and try again.'; end if;
 if order_number is null or length(trim(order_number)) not between 1 and 80 or order_notes is null or length(order_notes)>500 then raise exception 'Enter an order number and a note of up to 500 characters'; end if;
 if r."order"=trim(order_number) and r.notes=trim(order_notes) then return; end if;
 update public.pickup_requests set "order"=trim(order_number),notes=trim(order_notes) where id=r.id;
 insert into public.pickup_messages(request_id,body) values(r.id,'Order details updated. Order number: '||r."order"||' → '||trim(order_number)||E'\nPrevious note: '||coalesce(nullif(r.notes,''),'(none)')||E'\nUpdated note: '||coalesce(nullif(trim(order_notes),''),'(none)'));
end; $$;
create or replace function public.beardash_receive_order(order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.pickup_requests;
begin
 perform beardash_delivery.require_member(); perform pg_advisory_xact_lock(95381266);
 select * into r from public.pickup_requests where id=order_id and user_id=auth.uid();
 if not found then raise exception 'Order not found for your account'; end if;
 if r.member_received_at is not null then return; end if;
 if r.status not in ('accepted','picked_up','delivered') or not exists(select 1 from public.delivery_bookings where id=r.booking_id and state='active') then raise exception 'Only an accepted or delivered order can be marked received'; end if;
 update public.pickup_requests set status='delivered',member_received_at=now() where id=r.id;
 insert into public.pickup_messages(request_id,body) values(r.id,'I confirmed that I received this order. It is now marked delivered.');
end; $$;
revoke all on function public.beardash_edit_order(uuid,text,text,text,text),public.beardash_receive_order(uuid) from public,anon,authenticated;
grant execute on function public.beardash_edit_order(uuid,text,text,text,text),public.beardash_receive_order(uuid) to authenticated;
commit;
select 'Order editing and member delivery confirmation installed' as result;
