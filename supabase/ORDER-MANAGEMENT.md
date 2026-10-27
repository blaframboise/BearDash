# Member order corrections and delivery confirmation

Run `order-management.sql` once in the Supabase SQL Editor after the existing delivery-runs and messages migrations. It adds a nullable receipt timestamp and two authenticated RPCs; it does not delete existing orders or grant direct table writes.

Members can edit their own order number and note while the order is pending or accepted, its booking is active, and Bear has not closed pickups. The original values are checked to prevent overwriting another edit. Corrections retain acceptance and payment state, and append the before/after details to the private conversation. Existing member-message push notifications alert Bear. The editor reminds members to resend any store authorization email with the corrected details.

Members can confirm receipt of their own accepted, picked-up, or delivered order with an active booking. A confirmation dialog precedes the change. It marks only that order delivered, records member_received_at, and adds a private conversation message. Repeating the operation creates no duplicate message. This does not close the run, confirm payment, or affect other orders. Both dashboards move member-confirmed orders to Previous Orders immediately; other delivered orders retain the existing next-day archive behavior.

Verify on the hosted app after running SQL: correct a test order, refresh Bear's dashboard, then confirm receipt and check Previous Orders. Editing closed pickups is intentionally unavailable; use the conversation for late corrections.
