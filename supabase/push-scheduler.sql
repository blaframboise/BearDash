-- Run after deploying/initializing the beardash-push Edge Function.
-- Supabase manages these extensions; this creates no external accounts or API keys.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('beardash-push-dispatch','* * * * *',
 $job$select beardash_push.wake();$job$);
select 'Push retry scheduler installed' as result;
