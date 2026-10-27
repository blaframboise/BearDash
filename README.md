# BearDash 🐻

Your cards. Bear delivered. An installable web app for the playgroup’s Monday and Friday pickup runs from Gamer’s Gauntlet to Eternal Games in Warren, Michigan.

## Shared app setup

The frontend now uses Supabase email/password accounts, approved group membership, shared pickup requests, and Bear-only status/settings controls. **The database SQL and authentication settings must be applied before shared use works.** See [the setup guide](supabase/README.md) and [setup.sql](supabase/setup.sql).

The project URL and publishable key in app.js are intentionally public browser configuration. Database permissions must be enforced by RLS, never by hiding the key. No secret/service-role key belongs in this repository.

Members request pickups, Bear accepts/declines/marks delivery, and accepted requests unlock a $5 Venmo link and prewritten store authorization email. Users must review and send both; links do not verify payment or email delivery. Bear sets his recognized pickup name in Playgroup setup. Confirm the store permits third-party pickup.

Requests refresh every 15 seconds while the page is open, or manually with Refresh pickups. Background alerts for Bear require the separate push activation steps below. Old local-preview requests are not imported. Account sessions are remembered in localStorage and refreshed automatically; sign-out clears local/session storage and displayed records. Only static app assets are cached offline; shared requests require network access.

## Local development

No dependencies or build step. Use the existing checkout; a cloud task is already isolated and does not need an additional Git worktree.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Run `node --check app.js`, `node --check sw.js`, and `git diff --check`. Live authentication requires the exact development return URL to be permitted in Supabase if testing signup confirmations. Browser checks with simulated API responses validate UI behavior only. Follow the setup guide's separate-account live checks to validate real database permissions.

## GitHub Pages and installation

GitHub Pages deploys master at https://blaframboise.github.io/BearDash/. No frontend build is required. Keep private order data out of GitHub. On iPhone use Safari → Share → Add to Home Screen; on Android use Install app or Add to Home screen. The supplied PNG icon is configured for the manifest and Apple home screen. Original wordmark, hero, mascot, and icon assets live at the repository root.

## App screens

Members have Main, My Pickups, and Request a Pickup screens. Main includes ordering instructions and the store homepage link. Account sign-in, sign-out, refresh, and Bear settings live in the header menu. Bear-role accounts open directly to the delivery dashboard, with member screens hidden. These interface distinctions supplement the existing database role policies. Store checkout and copying order numbers remain manual.

## Delivery runs, cancellations, BearMail, and refunds

This update adds one $5 booking per member/run (including extra orders), Bear's Picked Up cutoff, date availability, cancellation banners, BearMail, member rescheduling/refund choices, and manual Venmo refund controls. **Activate it by running [delivery-runs.sql](supabase/delivery-runs.sql) once.** Follow the [activation and validation guide](supabase/DELIVERY-RUNS.md). Existing pickups/conversations stay intact; historical payments are not assumed verified. Payments/refunds remain manual Venmo transactions. BearMail has in-app unread indicators, not background phone notifications. Gamer's Gauntlet accepts the authorization email process, as confirmed by the organizer.

## Previous Orders

Delivered orders move out of the current member and Bear lists the day after their scheduled date in America/Detroit. Previous Orders is available from the hamburger menu, the member pickup screen, and Bear’s dashboard. Partially completed runs keep unfinished orders visible. History preserves conversations and does not show payment or delivery controls. Orders members explicitly confirm received move to history immediately; other delivered orders remain current until their scheduled date passes.

## Background notifications for Bear

Push alerts for new orders, member replies, and refund requests are implemented but require [the push activation steps](supabase/PUSH-NOTIFICATIONS.md): a new SQL migration, one Supabase Edge Function, administrator initialization, a scheduler, and Bear's explicit device permission. No Resend/domain or manual VAPID-key copying is required. The dashboard still works independently. Ordinary members do not receive these push alerts. Live iPhone delivery must be tested after deployment; local tests alone do not establish readiness.

## Member order management

Members can correct an order number or note before the run closes and confirm receipt of their own accepted orders. Receipt confirmation marks delivery on both dashboards and moves the order straight to Previous Orders. Each change adds a conversation message for Bear. Activate with [order-management.sql](supabase/order-management.sql); see [setup and behavior](supabase/ORDER-MANAGEMENT.md). Existing payments, bookings, and conversations are preserved.
