# Activate delivery runs, BearMail, and refunds

The frontend and SQL are one feature update. Run `delivery-runs.sql` **once**, in a new Supabase SQL Editor snippet, after the original setup, messaging, signup alerts, and member approvals migrations. Do not rerun earlier migrations. A successful result says `Delivery runs, BearMail, and refunds installed`. No new secrets, external services, or changes to the Apps Script key are needed. Until the migration is applied, new run requests/payment controls are paused and the app shows an unavailable-schedule notice. Existing accounts and conversations are preserved.

## Member workflow

- One booking groups a member's orders on one Monday/Friday, with one **$5** fee for that run. Each order still requires Bear's acceptance and its own authorization email. Gamer's Gauntlet's authorization-email process has been confirmed by the organizer.
- Request a Pickup shows dates up to eight weeks out. Cancelled and Picked Up dates are disabled. The fee explanation distinguishes an addition to the existing run from a new $5 run. **Add another order · no extra fee** selects the current run. Orders cannot slip past the cutoff through a direct API call.
- After acceptance, a single Venmo button appears on the booking, rather than on each order. **I sent the $5** is a member report, not payment verification. Bear can separately confirm receipt after checking Venmo. Once reported/confirmed, the app says not to pay again.
- Cancelling a scheduled run creates a prominent date banner and BearMail. Affected bookings offer a new date, a $5 refund request (conditional Venmo username plus confirmation that $5 was paid), or cancellation without refund if unpaid. A payment report/credit moves with rescheduled orders; no additional fee is charged. If the member paid but had not reported it yet, the reschedule form lets them report that original payment before moving it. Unpaid bookings still owe the original one fee after acceptance.
- Existing request IDs and conversations survive rescheduling. The moved orders await Bear's acceptance again. A re-enabled date does not silently move cancelled orders; the member must choose it.

## Bear workflow

Hamburger menu or dashboard: **Pickup Schedule**, **Refund Requests**, **BearMail**.

- **Picked Up** closes an entire run and marks its accepted orders Picked Up. Bear must resolve pending orders first. He can mark individual Picked Up orders Delivered. A closed run cannot be reopened or cancelled; a late order needs another available date and a fresh $5 run.
- **Turn off this date** previews the number of affected members, warns of refund responsibility, and optionally includes a reason. Confirming sends a global BearMail cancellation and targeted notices. The server rejects confirmation if the affected-member count changed in the meantime. Turning off an empty date still warns all members.
- Refund Requests shows one $5 refund per affected member booking, the supplied recipient, and an **Open Venmo to refund $5** link. Bear must check that payment was received and send the refund in Venmo. **Mark refund sent** has a separate confirmation and records who marked it and when; it notifies the member to verify receipt. Neither opening a link nor marking sent verifies money movement.
- Bear can publish group announcements through BearMail. Member inboxes include global announcements and their own notices; other members' refund usernames/notices remain private. Bear sees delivery notices needed to manage the group. Read indicators and menu badges update while the app is open. There are no background email/SMS/push notifications for BearMail.

## Credit and history safeguards

- Migration groups existing orders by member/date; it does not invent historical payments or refunds. Existing booking payments start **unconfirmed**. Review legacy test orders before real use, and report/confirm genuine payments manually. No existing order or conversation is deleted.
- One current booking per member/date is enforced by an index. Rescheduled/refunded/cancelled booking records stay as history. If a refunded run is reopened, a member may make a new booking with a fresh fee; its old refund record is preserved.
- A cancelled paid booking can merge into an unpaid booking on the new date and carry its credit. If **both dates already have reported/confirmed payments**, the app refuses to silently merge away one payment. Choose a different date or request the original refund instead.
- Refund choices are per booking, not per order. Repeated refund-sent operations are rejected. Member write access to booking/payment/status tables is blocked; authenticated RPCs enforce identity, roles, valid states, and the transaction lock around cutoff/cancellation/rescheduling/refund operations.

## Validate after applying SQL

Use test orders and do **not** send real money or store emails:

1. Member adds two orders to one date; Bear accepts both. Confirm one booking and one $5 button.
2. Bear marks that run Picked Up. Member cannot add to it; a later date clearly shows a new $5 run. Bear marks the orders Delivered.
3. Create a separate future test booking. Bear cancels its date, reviewing the affected-member count. Check the banner, BearMail, and the member's choices.
4. Test rescheduling with one account and a refund request with another. Enter the test recipient carefully; open the refund link only to check the recipient/amount and do not transfer money. Marking the test refund sent is a record for the test, not proof of payment.
5. Confirm ordinary members cannot see each other's bookings, conversations, refund usernames, or private notices. Confirm the administrator does not gain Bear's delivery controls merely by being an administrator.

Local automated checks execute PostgreSQL/RLS using PGlite and a browser against that local database. They cover migrations with existing data, fee grouping, cutoff/cancellation rules, payment-credit protection, refunds, privacy, UI flows, and viewport overflow. Hosted Supabase/Auth permissions and actual Venmo/email handoffs still require live checks.

```sh
npm ci --prefix tests
npm test --prefix tests
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser --prefix tests
```

The app remains static: no npm install or build is needed to host it. Only tests use these dependencies.
