# Gmail signup alerts — setup required

No Resend account or owned domain is required. Google Apps Script runs from the organizer's **personal Google account** and sends alerts to BearDash.support@gmail.com, a different inbox. This avoids depending on notifications for self-sent mail. Your personal sender address will be visible only in the internal alerts; signup emails are never sent to applicants by this script.

1. Run `supabase/signup-alerts.sql` ONCE in a new Supabase SQL Editor query. Unlike previous migrations, it returns a private notification key. Keep it out of chat, GitHub, screenshots, and shared documents. This credential permits reading queued signup email addresses and acknowledging those alerts, not managing members or reading orders. Do not share the saved SQL result. It can be rotated by the database owner.
2. While signed in to your personal Google account, visit script.google.com, create New project, and name it BearDash signup alerts.
3. Paste `SignupAlerts.gs` into Code.gs and save.
4. Project Settings > Script properties > Add script property: name `BEARDASH_ALERT_KEY`, value the private key returned by step 1. Do not place it in source code. Restrict editor access to this Apps Script project.
5. Choose `sendBearDashTestEmail` in the function selector and click Run. Review Google's requested email-send permission. This is your own unpublished script; proceed only while signed in to your intended Google account and after reviewing the code. If work/Google policies block authorization, stop and report the message. Verify the support inbox receives the test and your iPhone notifies you. Run this from a personal account, not a work account subject to employer policies.
6. Run `sendBearDashSignupAlerts` once and authorize its external-service access when requested. An empty queue produces no email. This verifies connectivity and credentials only; test a real confirmed pending signup too.
7. Triggers (clock icon) > Add Trigger: function `sendBearDashSignupAlerts`, deployment Head, event source Time-driven, Minutes timer, Every 5 minutes. Configure failure notifications to reach your personal account. Triggers run under the account that created them. Check Apps Script Executions if alerts stop.

Alerts start after email confirmation, not before. Approved members are omitted. Existing confirmed pending accounts are included. This is polling, not instant delivery: allow roughly 5 minutes plus email delay. Google quotas apply and triggers may run late. A failed send stays pending. A successful send followed by an interrupted acknowledgement may generate a duplicate on retry. This script does not implement the upcoming Member Approvals UI.

The SQL and script must both be installed to activate alerts. No live Google authorization, SQL execution, email delivery, or trigger creation is established by committing these files. Test the full route before relying on it.
