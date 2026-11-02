# Historical pre-recovery research

This document records the earlier source-blocked investigation. Source recovery and local implementation are now complete; consult [reconciliation.md](reconciliation.md), [source-recovery-audit.md](source-recovery-audit.md), and [QA.md](QA.md) for current status. Live OAuth and Drive verification remain pending.

# Integration readiness — 4EIGN Content HQ 3.0

Research date: 2026-11-02. This document records evidence and an implementation proposal; it does not report a working integration.

## Current status

| Area | Evidence | Status |
| --- | --- | --- |
| Application | Starting repository contains only a README; source archives are unavailable. | No authentication or media implementation to exercise. |
| Supabase | User supplied project ID `gytldbxbvnrxhsprovfm`; no Supabase binding names were found during the root audit. | Project configuration, schema, OAuth, RLS, and access remain unverified. |
| Google Drive | User supplied folder ID `1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn`. The root audit found a Google credentials binding name, without reading its value. | Credential scope, principal, folder access, and storage quota remain unverified. |
| ChatGPT login | Official Codex documentation demonstrates ChatGPT login for Codex. The inspected Apps SDK example uses an application's authorization server for protected tool calls. | No supported general-purpose ChatGPT identity-provider registration flow for this standalone application was established. |

No accounts, permissions, database schema, OAuth provider settings, Drive files, or production services were changed. No credentials were read or displayed in this research.

## Official sources and access limits

Direct requests to `supabase.com`, `developers.openai.com`, and `developers.google.com` failed with proxy `403 Forbidden`. Official repository sources on `raw.githubusercontent.com` were accessible and inspected instead:

1. [Supabase OAuth client implementation](https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts) documents `signInWithOAuth` and PKCE support; [provider types](https://github.com/supabase/auth-js/blob/master/src/lib/types.ts) include `google`.
2. [Supabase before-user-created hook source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks/before-user-created-hook.mdx) describes rejecting signup before insertion into the database.
3. [Supabase RLS documentation source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx) describes database-enforced policies, service-role bypass, unsafe authorization through editable user metadata, and stale JWT claims.
4. [OpenAI Codex README](https://github.com/openai/codex/blob/main/README.md) documents “Sign in with ChatGPT” for using Codex with a ChatGPT plan. Its [authentication document](https://github.com/openai/codex/blob/main/docs/authentication.md) points to the developer documentation that was inaccessible here.
5. [OpenAI Apps SDK authenticated example](https://github.com/openai/openai-apps-sdk-examples/blob/main/authenticated_server_python/main.py) accepts `AUTHORIZATION_SERVER_URL` and advertises that authorization server in protected-resource metadata. It does not establish ChatGPT as this application's identity provider.
6. [Google's official Node API client README](https://github.com/googleapis/google-api-nodejs-client/blob/main/README.md) documents OAuth refresh tokens and streaming media uploads without loading whole files into memory.
7. [Google Drive v3 API discovery document](https://github.com/googleapis/google-api-nodejs-client/blob/main/discovery/drive-v3.json) exposes resumable file-create/update upload protocols, file downloads with `alt=media`, and warns that `files.delete` permanently deletes files. Its stated upload limit is 5,120 GB, so Drive's API does not impose a 25 MiB ceiling; application infrastructure and account limits still need testing.

These are branch URLs, not immutable citations. Recheck relevant documentation when implementing against the recovered application's pinned versions. Failure to find general ChatGPT login support is not proof that no such offering exists; it is insufficient evidence to enable that provider.

## Proposed Google authentication and private access

Use Supabase's Google OAuth flow with PKCE and exact development redirect URLs. Preserve the production Site URL and existing provider settings. The expected hosted Supabase callback is `https://gytldbxbvnrxhsprovfm.supabase.co/auth/v1/callback`; confirm project configuration, including any custom domain, before changing Google OAuth settings.

Prepare an exact-email, case-normalized invitation allowlist and a before-user-created hook or equivalent supported private-registration gate. A general `gmail.com` domain restriction would not meet the requirement. Recheck membership on every protected operation so existing but unauthorized accounts and revoked members are also denied. Confirm the recovered schema and deployed Supabase hook support before choosing a migration.

Validate sessions on the server through a supported Supabase verification API. Bind role membership to the verified Supabase user ID and trusted Google identity. Require appropriate provider/email verification before provisioning membership. Do not trust form fields, browser state, decoded-but-unverified JWTs, or editable `user_metadata` as proof of identity or role. The requested email-to-role mapping is a requirement, not evidence that accounts have been provisioned.

Prepare additive, reviewable RLS migrations for the actual recovered tables: posts, media metadata, associations, account visibility, and memberships. Default deny anonymous/nonmember requests. Allow brand members to read only; allow managers and owners to perform specifically authorized content operations. Protect role assignment separately from content editing; managers must not promote themselves. Use both existing-row and resulting-row checks for updates. Keep privileged keys server-side and avoid using a service-role client for ordinary user operations because it bypasses RLS. Secure views, RPCs, and server media routes as well as tables.

Do not activate “Continue with ChatGPT” until official third-party provider support, client registration, token validation, and a working callback are verified. Codex session tokens or client IDs must not be repurposed. If the design retains the requested label, use an explicitly unavailable state with an accessible explanation; do not simulate login. A separate mock workspace may support local development, but it must be visibly marked and cannot authorize live backend access.

### Required inputs and configuration

- Recovered application source, actual schema/migrations, and official logo asset.
- A Supabase public publishable/anon client key and confirmed API URL, supplied through supported environment configuration. Public client keys do not replace RLS.
- Confirmation that the Google OAuth provider is enabled and correctly configured, with its secret held in Supabase/provider settings rather than frontend code.
- An approved private development origin and redirect allowlist; no production callback replacement.
- Read-only inspection access to existing schema/RLS and provider configuration, plus authorization for any concrete live changes after review.
- Test identities with verified role assignments; do not create privileged accounts merely to make tests pass.

## Proposed private Google Drive media flow

Keep original photos/videos in the specified folder and store Drive file IDs plus associations and metadata in Supabase. First establish whether the folder is in My Drive or a Shared Drive, the intended owning principal, the available quota, and the supported credential type. Reuse an existing suitable binding where possible; do not assume a service account can own arbitrary My Drive uploads or that a folder ID grants access.

Use an authenticated server boundary for Drive operations. For each upload, preview, download, and association update, verify the Supabase session and current membership, then authorize the requested record and file. Derive folder/file IDs from trusted metadata; do not proxy arbitrary user-provided URLs or arbitrary Drive IDs. Use the minimum scopes appropriate to the existing-file access model; scope selection and sharing need explicit verification.

Implement resumable uploads for large files, with a bounded streaming path and retry/resume support. Avoid base64 encoding or buffering full videos in memory. Confirm the selected hosting runtime's body, duration, memory, and streaming limits before choosing that runtime. Keep provider access/refresh tokens server-side. Treat resumable session URLs as sensitive bearer capabilities; do not log them or persist them in public metadata. If a direct browser upload design is necessary, review its authorization and capability exposure explicitly before adopting it.

Serve private previews/downloads through authorized streaming endpoints with appropriate content type, disposition, range handling for videos, and private/no-store cache policy. Do not set Drive permissions to public or expose privileged credentials to obtain working previews. The PWA service worker must not cache private media or authenticated responses.

“Remove attachment” should remove the post association without deleting the Drive original. Do not call `files.delete` as an attachment-removal shortcut. Upload completion should verify the actual Drive file, parent folder, size, and MIME type before recording it as available. Handle interrupted uploads and metadata failures without deleting historical originals.

### Required inputs and configuration

- Confirmation of folder location/type, owning principal, and authorized read/write operations.
- A suitable existing credential binding or securely configured delegated OAuth credential with required scopes; inspect only metadata/presence before requesting new credentials.
- Confirmed network routes for Google authorization/API endpoints and the specific Supabase project. Documentation access would also require the blocked official documentation hosts. No network draft was changed by this research.
- A backend/private-preview runtime capable of securely streaming files larger than 25 MiB.

## Verification required after source recovery

- Install from the recovered lockfile, then run actual lint, type-check, build, and test commands.
- Complete a real Google OAuth round trip on the private development origin; test denied uninvited users, invalid/expired sessions, logout, and callback errors.
- Exercise RLS directly as anonymous, outsider, brand member, manager, and owner. Test rejected role escalation and cross-record access, not just hidden UI controls.
- Verify authorized upload, preview, range playback, download, and association removal. Test a real file larger than 25 MiB, interrupted/resumed upload, unsupported content, unauthorized access, and credential expiry. Confirm originals remain private and association removal preserves files.
- Keep mock-mode tests, local backend tests, and live integration tests separately reported. None of these checks has run yet because there is no recovered application.
