# Verification record — 2026-10-28

## Frozen migration

`supabase/migrations/20261028164801_hq_workspace_security.sql`

SHA-256: `59e0e0282be1d0c17e922c9a4dc59314198ab0749aed5bbbcb7575316ca152af`

Prepared with CLI `2.122.0`; no remote resources or credentials changed by this database implementation task.

## Executed locally

- **7/7 Node static contract tests passed**: `node --import tsx --test tests/backend-security.test.ts`.
- **Migration and 44 SQL assertions passed** on PostgreSQL 18.6 / PGlite 0.5.13 with test-only Auth/Storage schema stubs. All fixtures rolled back.
- **ESLint passed** for `tests/backend-security.test.ts` and `supabase/tests/run-embedded.mjs`.
- Storage bucket and metadata cap agree: **25 MiB**; MIME types jpeg/png/webp/mp4/webm only.

The embedded run checks actual PostgreSQL RLS, GRANT/REVOKE, SECURITY DEFINER calls, invoker triggers, role changes, and foreign/check constraints. It is not a substitute for running against the target Supabase PostgreSQL version or validating the Storage HTTP service. An initial path-name shadowing issue was detected by the runtime test and corrected using the fully qualified `storage.objects.name` in tenant predicates before freezing this hash.

## Ready to execute under the parent's authorized deployment review

1. Apply the frozen migration to the verified fresh HQ project.
2. Run security/performance advisors and inspect real table grants, RLS policies, helper ownership/search paths, and the private bucket.
3. Execute `supabase/tests/security.sql` as one administrator SQL transaction. It inserts deterministic `.invalid` Auth test identities, two test workspaces, and object **metadata only**, performs permission checks using `SET LOCAL ROLE`, and rolls everything back. It creates no actual binary objects and sends no invitations/emails. It should only be run on a deliberately authorized empty/local/staging project with no unreviewed side-effect triggers. No persistent fake users or memberships remain on success; on error, abort/rollback the transaction before continuing.
4. After actual users have been separately authorized/provisioned, validate the real Auth/Data API/Storage HTTP upload/download/signing flow with owner, collaborator, outsider, and signed-out sessions. Existing signed URLs remain valid until expiry.

Remote advisor outcomes and HTTP checks were **not** performed by this local-only task and must not be represented as passed on the basis of this record.
