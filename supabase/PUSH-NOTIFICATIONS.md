# Activate Bear's background push notifications

This adds alerts for **new pickup requests (including rescheduled requests needing acceptance), new member replies, and refund requests**. Bear's own replies do not alert him. Alerts contain generic text, not member names, order contents, email addresses, refund usernames, or message bodies. Tapping an order/reply alert opens that pickup's conversation when it is available to the signed-in Bear account. Refund alerts open Refund Requests.

No Resend account, owned sending domain, Apple Developer account, or manually copied VAPID keys are required. It uses Supabase and the device browser's Web Push service. Supabase function/database usage counts toward the project's plan limits. Delivery is best effort: Focus, OS settings, network, permissions, and provider conditions can delay/silence alerts. BearDash's dashboard remains the source of truth.

**Committing these files does not install the database, deploy the function, create the scheduler, grant device permission, or establish iPhone delivery.**

## 1. Install the push database

Copy `push-notifications.sql` into a new Supabase SQL Editor snippet and run **once**, after the existing migrations. The success message is `Push database installed; deploy the Edge Function next`.

This creates private subscriptions, keys, and a durable notification queue. It does not send historical orders/messages as new alerts. No private key is shown in the query result. Existing pickup data and signup-email notifications are unchanged.

## 2. Deploy one Supabase Edge Function

In the project dashboard, open **Edge Functions** and create a function using the editor (labels may vary by dashboard version):

- Function name: **beardash-push** (exactly).
- Replace the default `index.ts` with the complete contents of `functions/beardash-push/index.ts` in this repository.
- Deploy the function.
- In this function's settings, turn **Verify JWT / Verify JWT with legacy secret OFF**. This setting applies only to this function, not Auth or database RLS. The code validates the administrator's actual user JWT for initialization and requires a private server credential for dispatch. Keeping gateway JWT verification on prevents the private scheduled dispatcher from reaching the handler.

The function uses Supabase's built-in server environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`. Do not put a service-role key in the frontend or chat. The source contains no private credentials. If those built-in variables are missing, inspect the function's configuration rather than copying secrets into GitHub.

For a CLI deployment instead (only if the CLI is already connected to this project):

```sh
supabase functions deploy beardash-push --project-ref bvokijnmogjmftkggbxn --no-verify-jwt
```

The repository's `supabase/config.toml` records the same per-function JWT setting. The dashboard path does not require installing a CLI.

## 3. Initialize push from the administrator's account

Refresh BearDash, sign into **benjamin.laframboise@gmail.com**, and open **☰ → My BearDash Account**. Scroll to **BearDash notifications**, then click **Initialize push service**.

The function verifies administrator access, generates a VAPID key pair, and stores it in the private database schema. Only the public key is returned to browsers. Initialization is idempotent: clicking again does not rotate an existing pair and break subscriptions. Bear and ordinary members cannot initialize keys.

If initialization fails, confirm the deployed function name, complete source, and Verify JWT setting. The private key and dispatch credential should never be copied into a script, browser form, chat, or screenshot.

## 4. Install immediate wakes and the retry scheduler

Run `push-scheduler.sql` in a new SQL Editor snippet. It enables Supabase-managed `pg_net`/`pg_cron` extensions and creates the `beardash-push-dispatch` minute job. The result says `Push retry scheduler installed`.

New events normally wake the function immediately (throttled to one wake per five seconds). The minute scheduler retries missed wakes and due jobs. It does not call the Edge Function when there are no eligible pending jobs. The dispatch credential is read from the private table, not embedded in the cron command. Running the named schedule again replaces the same named job rather than intentionally creating another name.

If the project does not support/allow these extensions, stop and report the SQL error. Successful queue creation alone is not an active background delivery system. A supported server scheduler would be needed instead; browser polling cannot substitute when the app is closed.

## 5. Bear opts in on his device

On iPhone, use **iOS 16.4 or newer**, install BearDash on the home screen, and launch it from that icon. Inside the installed app:

1. Sign in as Bear.
2. Open **☰ → My BearDash Account** and scroll to **BearDash notifications**.
3. Tap **Enable notifications**, then **Allow** on the system prompt. Permission is requested only after this tap.
4. Tap **Send test notification**. This queues a real backend push; it is not a fake local-only alert. Close/minimize the app or lock the phone to check delivery.
5. If needed, enable BearDash in iPhone notification settings and check Focus/Scheduled Summary. Denied permission must be changed in device settings; the app cannot override it.

Each device opts in separately. Supported subscriptions are restricted to Apple Web Push, Google FCM, and Mozilla push endpoints. Ordinary members do not see these controls. The organizer can initialize the service but does not receive delivery alerts unless separately assigned Bear's role.

## Disable, sign out, and privacy

**Disable on this device** stops local display and removes the browser subscription. Sign-out does the same. The backend checks current Bear membership when creating/claiming jobs, so removed Bear roles do not receive future jobs. Expired endpoints (404/410) are disabled. Queued provider messages may race with a disable or account change; the payload deliberately contains no private order/message data, and local opt-out suppresses display.

Sessions normally remain signed in across app closures. Permission and the device preference survive app-shell updates. Local preference loss/browser data clearing requires enabling again. Safari/Chrome tabs and the installed iPhone app may have separate storage/permission contexts; enable in the installed app. Push is not activated just by having a compatible iOS version.

Keys/endpoints/auth secrets live in a non-exposed schema. Browser users can enroll/disable only their own Bear subscription. Server-only RPCs claim leased jobs, record results, retry transient failures with backoff (at most five claims, within a 24-hour queue window), and discard expired endpoints. The push TTL is one hour after provider acceptance. Failed acknowledgement can cause a retry; a stable notification tag limits duplicate display. Provider acceptance is not proof the OS showed a banner.

## Live acceptance checks

After setup, have Bear enable and receive the test with the app closed. Then, from a regular member account:

- Submit a **test pickup** and verify Bear receives an alert; tapping opens that pickup.
- Send a conversation reply; Bear receives it. Have Bear reply; he should not alert himself.
- Use a cancelled **test booking** to request a refund; tapping its alert opens Refund Requests. Do not send money for tests.
- Disable notifications on Bear's device; subsequent events must not display there. Re-enable and test again.

Do not claim background alerts are live until these device checks pass.

## Diagnostics without revealing credentials

These SQL Editor queries show status only, not keys/endpoints/message contents:

```sql
select public_key is not null as initialized,last_dispatch_at
from beardash_push.config where id=true;

select kind,coalesce(outcome,'pending') as outcome,last_status,count(*)
from beardash_push.jobs
group by kind,outcome,last_status order by kind,outcome;

select jobname,schedule,active from cron.job
where jobname='beardash-push-dispatch';
```

Function logs use generic messages and provider HTTP status codes. Never paste raw subscription objects, config rows, authorization headers, or request bodies. Common issues: Verify JWT still on, missing scheduler/extensions, an uninitialized service, permission denied, app opened in a browser tab rather than from the home screen, or a stale service worker. Reload the installed app after deployment so the new push-capable worker can activate.

## Local verification

```sh
npm ci --prefix tests
npm test --prefix tests
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser --prefix tests
```

Tests execute PostgreSQL privilege/queue logic, real Web Push encryption and VAPID signature generation, worker authentication/endpoint validation, service-worker display/click routing, and browser permission/subscription flows with simulated device APIs. Supabase's hosted Edge runtime, pg_net/pg_cron delivery, actual Apple/Google/Mozilla responses, and iPhone notification display remain live setup checks.
