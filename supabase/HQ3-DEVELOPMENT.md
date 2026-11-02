# HQ 3.0 authentication and policy upgrade

Prepared locally. **No migration, account provisioning, OAuth configuration, or live permission change was applied to the hosted Supabase project.**

## Changes

`20261102170000_hq3_roles_progress.sql` follows the historical HQ2 migration without rewriting it. It preserves `owner` and `collaborator`, adds `manager` and `brand_member`, and requires confirmed Auth email in the identity-bound database helpers. A brand member can read authorized workspace data but cannot mutate posts, comments, progress, media metadata, or Storage objects. Managers retain collaborator restrictions on approval/publication and approved content. Membership and account administration remain unavailable to frontend users.

Existing permissive write policies are explicitly replaced, because adding a second permissive policy would combine with OR and fail to enforce read-only access. `hq_private.is_editor` is caller-bound, has a fixed search path, lives outside the exposed API schema, and checks current trusted membership rather than editable JWT claims.

Posts gain `notes` and `account_ids`; a trigger validates collaborative accounts against the same workspace and requires the primary account. Empty arrays preserve the existing single-account interpretation. Existing Storage assets and 25 MiB constraints remain intact; Drive storage is prepared separately.

`content_post_progress` stores `not_started`, `in_progress`, or `done` independently from captions, scheduling, approval, and notes. An authorized editor can change an approved post's task progress without changing its approved content. Progress attribution and tenant/post identity are enforced in SQL. The adapter's `savePost` deliberately does not write task progress; use `saveProgress` for that action so a stale post editor cannot reset newer progress.

The browser adapter uses real Supabase Google OAuth with PKCE and a same-origin `/auth/callback/` URL. It reuses one browser Auth client so React remounts do not exchange the callback code twice. URL session handling runs in the SDK; do not add a second manual code exchange in the callback page. Password sign-in is unavailable in the new UI/adapter. A verified Auth user still needs a trusted workspace membership; successful Google OAuth alone does not grant workspace access.

Historical rows remain readable. Only a confirmed missing `content_post_progress` relation/schema-cache entry is treated as a legacy-schema fallback. Authorization and network failures are surfaced. Writes requiring HQ3 columns/tables fail with an explicit migration message instead of silently dropping data.

## Prerequisites before any live rollout

1. Inspect the actual hosted schema, migrations, policies, grants, function ownership, and existing roles. This migration assumes the recovered HQ2 schema and its named role constraint/policies. Do not apply blindly to a different or shared schema.
2. Review and authorize the concrete migration and Google provider/redirect configuration separately. Preserve the existing production Site and its settings.
3. Keep `hq_private` outside the exposed API schemas. Verify all enabled API paths and any additional policies; the local harness cannot establish hosted configuration.
4. Configure private registration through the supported Supabase administrative settings or reviewed invitation hook. Hiding a signup form does not disable the Auth signup API. Do not invent or provision owner accounts from email strings.
5. Verify actual Google identities and authorize their user-ID memberships through a trusted admin process. No user or role seeds are included here.
6. Verify Google OAuth round-trip, session expiry, logout, RLS through hosted HTTP APIs, and private media access with dedicated authorized test identities before claiming a live integration works.

## Isolated verification

Install the optional local PostgreSQL engine outside the repository:

```sh
npm install --prefix /tmp/hq3-sql-runtime --cache /tmp/hq3-npm-cache --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.13
PGLITE_MODULE=/tmp/hq3-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/run-embedded.mjs
```

The harness uses test-only platform stubs and in-memory PostgreSQL. Never apply `platform-fixture.sql` to Supabase. Its synthetic users are explicitly confirmed unless a test sets confirmation to null. All security-suite fixtures roll back.

Current implementation checks executed successfully:

- 23 targeted Node tests across `adapter.test.ts`, `backend-security.test.ts`, and `hq3-auth.test.ts`.
- Targeted ESLint on the changed adapter/validation/tests and the full TypeScript check.
- 44 historical SQL assertions and 36 HQ3 SQL assertions on PostgreSQL 18.6 / PGlite 0.5.13, applying the historical, HQ3 roles/progress, and Drive metadata migrations.

HQ3 assertions exercise manager draft edits, approved-content denial, approved-post progress, unchanged approval attribution, cross-workspace and duplicate collaboration rejection, progress spoofing/identity immutability, read-only mutation denial (including old authored comments), unverified-owner denial, outsider denial, and immediate membership revocation.

These are local policy and adapter results. They do not verify hosted Supabase Auth, Google OAuth provider configuration, Storage HTTP semantics, or Drive authorization.
