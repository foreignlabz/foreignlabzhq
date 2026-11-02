# Private registration hook

`20261102190000_private_registration.sql` prepares a local, reviewable Supabase **Before User Created** hook. It has been exercised only in the isolated PostgreSQL harness. **It has not been applied or enabled on the hosted project.**

## Behavior and separation of authority

- `hq_private.signup_invitations` starts empty. No real email addresses, Auth users, or memberships are seeded.
- An invitation is an exact, normalized email with an explicit expiration and optional revocation timestamp. Domain-wide matching and alias stripping are not used.
- `hq_private.before_user_created(event jsonb)` accepts only a non-anonymous Google signup with an active exact invitation. Malformed, expired, revoked, and uninvited requests return a generic HTTP 403 hook error; an allowed request returns `{}`.
- Admission permits Auth to continue creating the identity. It does **not** verify the email, grant membership, choose a role, or create an account itself. The existing verified-identity and trusted-membership checks still govern workspace access.
- The hook is `SECURITY INVOKER`, has a fixed empty `search_path`, and grants invocation only to `supabase_auth_admin` (apart from the database administrator/owner). That role receives only schema usage and RLS-protected SELECT on the private invitation table. It cannot create, extend, revoke, or delete invitations. Application roles and the ordinary service role cannot read that table or invoke the hook.
- Invitations are not consumed in the before-create transaction. This avoids treating an unsuccessful downstream identity creation as a completed invitation. They remain eligible until expiration/revocation; no workspace access is granted by that eligibility.
- Existing Auth accounts are not reprocessed by a creation hook. Removing an invitation therefore does not revoke an existing member: revoke membership and sessions through the authorized administrative workflow when needed.

## Required administrative activation

A reviewed SQL migration alone does not enforce private signup. After explicit authorization and verification of the intended target project:

1. Inspect current schema, policies, Auth settings, and any existing Before User Created hook. Reconcile rather than overwrite an existing hook. Keep `hq_private` outside the exposed Data API schemas.
2. Review/apply the migration through the approved workflow. The platform's `supabase_auth_admin` role must already exist; only the isolated test fixture creates a stand-in role.
3. Have an authorized administrator insert reviewed exact-email invitations with appropriate expirations. Do not auto-load the requested role mapping as privileged accounts. The invitation table has no role column and grants no workspace authority.
4. In the Supabase Dashboard, configure and enable **Authentication → Hooks → Before User Created** to use `hq_private.before_user_created`. Verify the selected project/function and runtime permissions. The corresponding documented Postgres hook URI is `pg-functions://postgres/hq_private/before_user_created` for configuration systems using that syntax. This repository has not enabled that configuration.
5. Preserve the production Site and existing callback settings. Confirm the intended development signup/provider settings admit the reviewed Google flow, while uninvited signup is rejected by the enabled hook. Disabling all signup globally also prevents an invited new identity from being created; configuration must be reviewed as a whole.
6. Exercise the hosted callback with explicitly authorized test identities, then separately verify email confirmation and trusted user-ID membership. Do not claim the live flow works from local SQL assertions.

Example **for review only**, using a synthetic address; do not execute blindly:

```sql
begin;
insert into hq_private.signup_invitations (email, expires_at)
values ('person@example.invalid', now() + interval '7 days');
commit;
```

Use an exact reviewed identity in the authorized administrative environment. Never place provider secrets or privileged credentials in this statement, browser code, logs, or chat. Invitation updates/revocations are administrator actions, not exposed application features.

## Verified contract and tests

Official Supabase documentation source was fetched read-only from its GitHub repository:

- [Before User Created hook](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks/before-user-created-hook.mdx): `event.user.email`, `app_metadata.provider`, `is_anonymous`, and the `{}` / `error.http_code` response contract.
- [Auth Hooks overview](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks.mdx): `supabase_auth_admin` execution, explicit schema/table grants and RLS, preference for invoker functions, and Postgres hook URI syntax.

`supabase/tests/security-registration.sql` executes 35 isolated assertions covering empty allowlist denial; valid, expired, revoked, case-normalized and exact-match invitations; provider and malformed-input rejection; grants/RLS; lack of automatic Auth accounts/memberships; and denied direct application access. All fixtures roll back.

The combined local harness passed 44 historical + 36 HQ3 + 14 Drive + 35 registration assertions (**129 total**) with all four migrations. Run it with the documented `npm run test:security` script or the `PGLITE_MODULE` command in `HQ3-DEVELOPMENT.md`. These are actual PostgreSQL policy/function checks, not hosted Google OAuth or Supabase hook activation tests.
