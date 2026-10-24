# Activate shared BearDash

1. In Supabase **SQL Editor**, create a query, paste `setup.sql`, and Run once. It creates only BearDash's three new tables, enables RLS, and limits status changes to Bear. Do not rerun blindly if tables already exist.
2. Under **Integrations → Data API**, ensure the API is enabled and `public` is an exposed schema. The SQL grants authenticated access explicitly; no anonymous table access is needed. Keep automatic exposure of new tables off.
3. Under **Authentication → URL Configuration**, set Site URL to `https://blaframboise.github.io/BearDash/` and add that exact URL to Redirect URLs.
4. Under Authentication's email provider settings, leave email/password enabled and **Confirm email ON**. The app uses email and password, with confirmation emails. Supabase's default email sender has recipient restrictions and low limits. For friends to sign up, configure a supported custom SMTP sender under Authentication email settings. Do not disable email confirmation to work around delivery failures. Password recovery emails also depend on this configuration.
5. Sign up at BearDash, confirm your email, and sign in. New accounts have **no group access** until approved in SQL Editor. Add each known friend's confirmed email with the query below. Assign `bear` only to Bear's account. Normal accounts use `member`. Never grant group_members writes to users or use editable user metadata for roles.

```sql
-- Replace the address and role. Run separately for each friend.
insert into public.group_members (user_id, role)
select id, 'member' from auth.users
where lower(email) = lower('FRIEND_EMAIL_HERE') and email_confirmed_at is not null
on conflict (user_id) do update set role = excluded.role;
```

For Bear use `'bear'` instead of `'member'`. Check the query affected one row. Review enrolled accounts with:

```sql
select u.email, m.role from public.group_members m
join auth.users u on u.id = m.user_id;
```

Bear sets his pickup name in Playgroup setup after signing in. The store must recognize that name. Payment and email require manual confirmation. Updates poll every 15 seconds while the app is open, with a Refresh button; there are no background/push notifications. Local prototype requests are intentionally not uploaded.

## Required live checks before inviting everyone

Use separate browser profiles/devices: member A, member B, Bear, and signed out. Confirm signed-out users cannot read/write tables, each member sees only their requests, members cannot change status/settings/roles or submit as another user, nonmembers see no group data, Bear sees both requests and can accept them, and the respective member sees acceptance after refresh. Confirm valid transitions and reject acceptance after delivery. Verify the real mobile Venmo and email handoff without assuming sending occurred. These hosted policies cannot be verified until SQL is applied; UI mocks do not prove authorization.

Only the public project URL and publishable key are in the frontend. Never add a service-role/secret key or database password. The service worker caches static assets only, never Supabase requests. Sign-out clears displayed group data. Auth session tokens live in sessionStorage and are cleared on sign-out; use a trusted device and close the tab when finished.
