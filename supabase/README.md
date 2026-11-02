# HQ backend: review and deployment handoff

**Prepared locally; not applied to any hosted project by this package.** Migration generated with Supabase CLI `2.122.0` (`migration new hq_workspace_security`). The CLI requires a writable home/cache; this workspace used `/tmp` without requesting broader permissions.

## Data contract

| Table | Purpose / key fields |
| --- | --- |
| `workspaces` | `id`, `name`; admin bootstrap only |
| `workspace_members` | PK `(workspace_id,user_id)`, `name`, `role`: `owner` or `collaborator`; admin writes only |
| `accounts` | `id`, `workspace_id`, `name`, `handle`, six-digit hex `color`; admin writes only |
| `weekly_visions` | `id`, `workspace_id`, Monday `week_start`, `text`, `updated_at`; unique `(workspace_id,week_start)` |
| `content_posts` | `id`, `workspace_id`, `account_id`, `title`, `caption`, nullable `scheduled_at`, `responsible_id`, `status`, nullable `media_path/media_type/media_name`, `video_url`, `created_by`, server-set `approved_by/approved_at/updated_at` |
| `post_comments` | `id`, `workspace_id`, `post_id`, `author_id`, `body`, `created_at` |
| `media_assets` | `id`, `workspace_id`, unique `object_path`, `uploaded_by`, `name`, `mime_type`, `size_bytes`, `created_at` |

Statuses: `idea`, `draft`, `in_review`, `approved`, `published`. Members read shared workspace records and edit/delete non-approved posts. Only an owner can write weekly vision, approve/publish, or modify/delete approved/published posts. Comment author cannot be spoofed; comments may be deleted by the author or owner, not edited. No client can insert/update memberships, accounts, or workspaces, including an owner: trusted admin provisioning is intentional in v1. No self-enrolment, signup trigger, exposed privileged RPC, or JWT role metadata is used.

Database access must use the signed-in user's token plus **publishable** key, never a privileged key in frontend code. Out-of-workspace records are invisible. UPDATE/DELETE denials through RLS can return zero rows rather than errors: client writes should request changed rows and reject an empty result.

## Private media

Bucket `hq-media` is private, maximum **25 MiB**, MIME allowlist `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`. No SVG/HTML upload.

1. Use a unique path: `${workspaceId}/${authUserId}/${crypto.randomUUID()}-${safeFilename}` (exactly three slash-separated segments).
2. Upload with `upsert: false`. Binary overwrite is deliberately forbidden, including by owner, to preserve approved assets. Replacing media means uploading a new unique object and changing an authorized post.
3. Insert the matching `media_assets` row with `object_path`, `workspace_id`, `uploaded_by`, original `name`, `mime_type`, and positive `size_bytes`. Only then save the post's `media_path` FK.
4. Generate short-lived signed URLs (e.g. 300 seconds); never store signed URLs in rows or use `getPublicUrl`. All workspace members can read workspace media, including unattached uploads.
5. Media metadata is immutable. Owner-only deletion avoids a collaborator invalidating approved media; delete referenced post attachments first. Use Storage API for actual binary deletion, not SQL on `storage.objects`. Handle incomplete uploads with an authorized owner cleanup process, not automatic broad deletion.

Membership revocation takes effect on the next DB/Storage authorization check, without refreshing JWT roles. **Already issued signed URLs remain usable until expiry**, and already downloaded bytes cannot be revoked. Untrusted external `video_url` links remain external providers' responsibility; only HTTPS is accepted, and the frontend must independently restrict safe embed providers if embedding.

## Provisioning checklist (manual; authorization required)

1. Confirm the target project's identity and that `public` is empty. Review this migration, including all grants, helper function owners, and Storage policies. Do not apply to a legacy/shared project without checking existing policies (permissive policies combine with OR).
2. Ensure `hq_private` is **not** among Data API exposed schemas. Leave it unexposed; `authenticated` gets only schema usage and execution of two identity-bound boolean helpers, not table creation. They need EXECUTE for policy evaluation. Only these two helpers are SECURITY DEFINER; fixed `search_path`, schema-qualified SQL, caller-bound `auth.uid()`, and no writes. Triggers are SECURITY INVOKER with direct execution revoked.
3. Apply the migration using an authorized migration workflow. No project, Auth setting, API key, email template, redirect, or Realtime change is part of this SQL. `storage.buckets` insert intentionally fails if this bucket already exists rather than silently changing an existing resource.
4. Invite/create the verified owner via an authorized Supabase Auth administrator flow. Do not auto-assign ownership to the first signup or trust client-provided name/email/metadata. Confirm the Auth identity and email verification.
5. Review `bootstrap.example.sql`, replace the owner UUID, and run the owner/workspace/account transaction once as database admin. Record the returned workspace UUID. Add only explicitly authorized collaborators in a separate reviewed transaction. Never commit placeholder values or secrets.
6. Configure the frontend with the project URL and public publishable key. The v1 adapter derives the workspace from the signed-in user's membership and requires exactly one membership; multiple memberships are rejected until an explicit workspace selector is implemented. The member/owner roles are DB data, not environment configuration or JWT claims. Do not log secret/privileged keys.
7. Run SQL assertions on a disposable local/staging Supabase database, then smoke-test browser/API authorization with owner, collaborator, outsider, and signed-out sessions. Confirm private Storage download/sign/upload through HTTP; SQL tests do not exercise Storage's HTTP service, MIME enforcement, signed-URL expiry, or binary storage.
8. Run Supabase security/performance advisors after application. Review any existing additional grants/policies and ensure no public URLs or broad Storage policies were added. Auth hardening (MFA, invite-only signup, leaked-password protections, redirect URLs) needs separate authorized project configuration review.

Membership removal is admin-only; revoke/remove the DB membership for immediate new-request access denial, and revoke Auth sessions where appropriate. Do not delete the only owner without arranging an authorized replacement. Existing post attribution uses Auth user references and is deliberately retained while membership can be removed.

## Verification

Default project tests run static contract checks (not a substitute for executing RLS):

```sh
node --import tsx --test tests/backend-security.test.ts
```

Actual SQL assertions run in a transaction and roll back every fixture. `security.sql` must run as a database administrator on an isolated Supabase local/staging database, never against production as a casual smoke test:

```sh
psql "$HQ_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
```

An optional **credential-free embedded PostgreSQL** harness applies test-only Supabase schema stubs, the real migration, then the same assertion script:

```sh
npm install --prefix /tmp/hq-sql-runtime --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.13
PGLITE_MODULE=/tmp/hq-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js \
  node supabase/tests/run-embedded.mjs
```

`platform-fixture.sql` is exclusively for that embedded harness; **never apply it to Supabase**. Embedded success verifies PostgreSQL grants/RLS/triggers/constraints, not a complete hosted Supabase deployment.

Covered: anonymous table denial; outsider reads denied; user-metadata spoof denied; membership self-enrolment/promotion denied; owner-only vision; member shared drafts; owner-only approval/publication; approved edit/delete lock; immutable creator/tenant; cross-tenant account/comment/media references; responsible member validation; comment attribution; private uploads bound to tenant/user; no binary overwrite; metadata immutability; immediate membership revocation. Run results are recorded in `VERIFICATION.md`.

## Current docs reviewed (2026-10-28)

- [Supabase changelog](https://supabase.com/changelog): scanned relevant breaking changes.
- [Explicit Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): migration does not rely on implicit grants.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [securing the API](https://supabase.com/docs/guides/api/securing-your-api): grants, private identity-bound helpers, per-operation policies, explicit update checks.
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control): private bucket, no overwrite policy, member-bound object paths.
- [TLS change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): use supported modern HTTPS clients; no schema impact.
- [Postgres security release](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): no affected ltree, legacy pgcrypto encryption, btree_gist, or custom operators used.
