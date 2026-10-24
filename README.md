# BearDash 🐻

Your cards. Bear delivered. An installable web app for the playgroup’s Monday and Friday pickup runs from Gamer’s Gauntlet to Eternal Games in Warren, Michigan.

## Current version: local interactive prototype

Includes responsive member requests, Bear’s accept/decline/delivered board, upcoming Michigan game-night dates, configurable $5 Venmo links, prewritten pickup authorization emails, and an offline app shell. All requests and settings are stored **only in the current browser**. Both views are intentionally accessible for demonstration. This version does not send requests to Bear, authenticate users, send notifications, verify payments, or send emails automatically. Do not use it as the group’s live dispatch system yet.

## Run locally

No dependencies or build step. From this checkout:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the local server in a browser. Submit a request, switch to Bear’s dashboard, accept it, and return to My pickups. Configure Bear’s public Venmo username, his pickup name, and the store’s confirmed pickup email under Playgroup setup. The payment and compose-email links then become available. The sender must confirm both actions. The store must agree to third-party collection; a prewritten email does not establish its policy.

## GitHub Pages

After reviewing and committing these files, push to GitHub. In repository Settings → Pages, choose Deploy from a branch, select the branch containing these files and /(root), and save. Relative paths support the `/BearDash/` project path. Pages is public hosting: do not commit private order information or credentials.

On iPhone, open the published HTTPS site in Safari and use Share → Add to Home Screen. On Android, use the browser’s Install app or Add to Home screen option. Browser installation support varies; a home-screen bookmark remains available. The uploaded PNG app icon is registered in the manifest and as the Apple home-screen icon. Original branding assets are included at the repository root.

## Make it work across the group’s phones

Recommended next step: keep the frontend on GitHub Pages and add Supabase authentication and a shared request database. Enforce row-level security so members can access only their own requests and only Bear’s server-assigned role can accept or decline. Never trust the current view switch as authorization. Add realtime subscriptions or notifications for accepted requests. Store the public group configuration centrally. Keep service-role credentials out of the browser and repository.

After acceptance, each member opens Venmo to confirm $5 and their email client to review/send authorization. Reliable automatic email would require a backend email provider and verified sender setup; sending as each member would require their email-provider authorization. Automatic Venmo transfers are not implemented or assumed available. An atomic transaction spanning pickup acceptance, Venmo, and email is not supported by these links.

Before live use: connect the backend, enforce and test access policies, validate shared updates with two accounts on separate devices, confirm the store’s authorization process and Bear’s contact details, and test mobile payment/email handoff.
