# HQ3 source reconciliation

This document explains how four uploaded packages became one development workspace. Source provenance is recorded in [archive-manifest.json](archive-manifest.json); current testing must be reported separately from recovered evidence.

## Selected foundation

Use the HQ2 Next.js/React application and its Supabase repository abstraction as the functional foundation. The supplied responsive and feed packages are additive descendants of that baseline; they provide visual references and screenshot-derived assets, not replacement authentication or database implementations.

| Source | Evidence from contents | Reconciliation |
| --- | --- | --- |
| `4EIGN-HQ-v2-source.zip` | Complete Next.js application, `HQRepository`, demo/Supabase adapters, relational schema and tests | Retain the stack, schema history, and existing workflow; extend through adapters and additive migrations. |
| `HQ3-responsive-retry.zip` | Only `AGENTS.md` differs from the baseline; seven additional files, no removals | Use the responsive visual direction. Preserve `hq-weekly.tsx` and its stylesheet; replace the preview route's entry point with the integrated HQ3 workspace. |
| `4EIGN-HQ-3.0-feed-preview.zip` | Every responsive-package file is identical; sixteen additions include twelve screenshot thumbnails | Preserve the prototype and assets. Integrate current/future feed composition with real workspace post metadata, account filters, and collaboration IDs. |
| `manager-progress-source-handoff.zip` | Partial patch against Cloudflare Workers with D1 JSON payloads and R2; dependencies outside the handoff are missing | Port the behavior, not its deployment layer, full files, or API authorization assumptions. |

The archive comparisons used content hashes, not filenames or the packages' reported test results. No patch was blindly applied over a different architecture.

## Manager progress port

The manager handoff uses `owner/editor` roles, JSON `posts.payload`, multiple asset records, separate local date/time fields, and `/api/hq` routes. HQ2 uses `owner/collaborator` roles, relational Supabase `content_posts`, an `HQRepository` interface, ISO timestamps, and a legacy single-media reference. Replacing the adapter or route files would discard existing infrastructure and would not compile without additional missing Cloudflare modules.

The port therefore introduces:

- `not_started`, `in_progress`, and `done` as task progress independent of editorial approval/publication.
- Dedicated `saveProgress` adapter operations. Normal post saves do not overwrite progress from a stale form.
- A separate workspace-scoped Supabase progress record so managers can update task progress without acquiring permission to alter approved content.
- Owner, manager, read-only brand-member, and retained legacy collaborator behavior. Trusted membership and RLS enforce live authorization; local demo switching grants no live access.
- Fresh progress state in calendar/details alongside a preserved unsaved editing draft; pending/error feedback; readable expandable creative notes; caption copying and review comments.

The handoff's button called its API even in demo mode, and its read-then-overwrite full-post save could race with a concurrent progress update. Those mechanisms were not copied. The new demo repository uses dedicated local mutations and retains prior-version localStorage under its original key.

## Preservation and deliberate changes

- `supabase/migrations/20261028164801_hq_workspace_security.sql` remains byte-identical to HQ2. New roles/progress, Drive, and private-registration changes are separate reviewable migrations; they have not been applied to the hosted project.
- `lib/public-config.ts` remains byte-identical to the recovered baseline. Its public project configuration is not proof of permission to modify that project's schema or provider settings. Privileged credentials must never enter browser code.
- `components/hq.tsx` remains the legacy UI, with a stylesheet import added to isolate its original styling and inherited trailing whitespace normalized. `/legacy/` renders it in demo mode. Its supporting adapters can evolve with the shared application contract; the untouched original remains in recovery staging and the original ZIP.
- `components/hq-weekly.tsx`, `components/hq-weekly.css`, `components/hq-feed.tsx`, and `components/hq-feed.css` remain byte-identical to the recovered prototypes. The new `workspace-*` components implement the integrated experience.
- Supplied README, agent guidance, and evidence are retained under `docs/recovered/`. These are historical documents and screenshots, not evidence that the new application passed their old checks.
- Recovered feed thumbnails are low-resolution screenshot references. The application labels them as snapshots, not a live Instagram connection or original publishing assets. No separate Dragon Ball Hunt project is modified.
- Removing a media attachment unlinks its association; it does not delete an original Drive file. No Drive delete endpoint is provided. Existing Supabase Storage media and schema history are preserved.

## Development routes and access

| Route | Purpose |
| --- | --- |
| `/` | HQ3 workspace using the configured Supabase adapter; Google sign-in and trusted membership are required for live data. |
| `/auth/callback/` | Supabase OAuth callback entry point using the same workspace/session validation. |
| `/demo/`, `/preview/` | Integrated fictional demo; Calendar/Week is the default. |
| `/feed-preview/` | Integrated demo opened on Feed Preview. |
| `/login-preview/` | Login design preview with sign-in disabled. |
| `/legacy/` | Preserved HQ2 demo presentation. |
| `/api/drive/...` | Authenticated private media API; disabled until explicitly configured. |

Every route is behind the development-preview proxy. `HQ_LOCAL_DEVELOPMENT=true` permits a loopback hostname only in development, with the dev wrapper bound to loopback. Production builds reject that bypass. External preview access requires secure `HQ_PREVIEW_USERNAME` and `HQ_PREVIEW_PASSWORD` configuration; missing configuration fails closed. The preview gate does not replace Supabase membership/RLS. Use HTTPS and an explicitly private deployment target before sharing a hosted preview.

The PWA manifest and service worker support installation, but the worker is intentionally network-only: no private media, tokens, or API responses are cached for offline use.

## Incomplete live dependencies

The official standalone logo is absent; the text wordmark/app monogram remain disclosed placeholders. Live Google OAuth, verified role provisioning, private registration settings, hosted migrations, real Drive credentials/folder access, and a private external host still require authorized configuration and verification. ChatGPT sign-in remains unavailable until a supported third-party flow can be established. See [Drive integration](drive-integration.md) for prepared routes and remaining runtime limitations.
