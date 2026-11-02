# 4EIGN Content HQ 3.0 — source recovery audit

Updated: 2026-11-02. This audit records recovered source and reconciliation evidence. It is not a report of live authentication, Google Drive access, or production deployment.

## Recovery completed

The starting checkout, `foreignlabz/foreignlabzhq` at `f341d868a95db1b76a1ca443c1ffd29f47256070`, contained only `README.md`. The user subsequently uploaded all four source packages. Recovery used these actual attachments, not assumed access to ChatGPT Library.

| Uploaded archive | SHA-256 |
| --- | --- |
| `4EIGN-HQ-v2-source.zip` | `23302d9d579b4f86c7ceb0219a363d3bd690bc3be9de019e16d54d0ab179cd40` |
| `manager-progress-source-handoff.zip` | `c9f64fd00c2c2818526d3bffa33e9d22c8c2a6b8f94e2a5f4b58494d2cd0f173` |
| `HQ3-responsive-retry.zip` | `fabda8c428b9c6396f6ebca336abf1308b2715bb71523f1a73abab98a6ef322f` |
| `4EIGN-HQ-3.0-feed-preview.zip` | `2fbaf99888f36e235ca0bd1c9969ec95524a94ac272049cff4649596883f4aca` |

`HQ3-responsive-retry.zip` is the supplied responsive package corresponding to the previously requested `4EIGN-HQ-3.0-responsive-prototype.zip`; the latter filename was not uploaded separately. [The archive manifest](archive-manifest.json) records hashes, entry counts, expanded sizes, and staging paths.

Original ZIPs remain under `/workspace/attachments/` in their attachment-specific directories. Each package was staged separately under `/workspace/hq3-recovery/`, outside the development checkout. Archive paths and metadata were checked for traversal, absolute paths, and symlinks. Original attachment hashes were rechecked against the manifest. No historical source package was deleted or overwritten.

## Source relationships verified

File-content comparisons establish the following:

- HQ2 is the complete Next.js/Supabase baseline: repository adapters, auth UI, post workflows, fixtures, SQL migration, and test suites.
- The responsive package changes only `AGENTS.md` among existing HQ2 files. It adds seven files: three legacy project skills, `HQ3_HANDOFF.md`, the preview route, and the weekly prototype component and stylesheet. It removes nothing.
- The feed package retains every responsive-package file byte-for-byte and adds sixteen files: its handoff, route, component, stylesheet, and twelve `public/feed/4eignlabz/` thumbnails. It removes nothing.
- The manager handoff is a patch for a different Cloudflare Workers/D1/R2 application. Its changed files are not drop-in replacements for the Supabase baseline. Its independent progress and manager workflow semantics were ported deliberately instead.

See [reconciliation decisions](reconciliation.md) for architecture differences, preserved files, and the selected implementation.

## Current development implementation

Work remains on `feat/hq3-liquid-glass-workspace`. The checkout now contains the recovered baseline and the HQ3 workspace: login presentation, Today/Week/Month calendar, post details, role-aware editing, independent task progress, media library, collaborative feed planning, and mobile/PWA support. A clearly labeled local demo supplies fictional members and posts without authenticating to live services.

The six requested skills live under `.agents/skills/`, and root `AGENTS.md` records the development and production boundaries. Legacy components and supplied evidence remain available; recovered evidence under `docs/recovered/` describes an earlier package and must not be cited as current QA.

Google OAuth code, additive roles/progress RLS changes, and private Drive server routes are prepared. This does not establish that the existing Supabase schema matches the migrations or that a real identity can complete sign-in. No hosted migrations, privileged account provisioning, Google provider changes, Drive uploads, production publication, or modifications to the existing HQ Site or Dragon Ball Hunt project were performed as part of recovery.

## Verification boundaries and remaining inputs

- Archive integrity and source comparisons above were executed against the supplied files.
- Development installation, tests, builds, and browser QA are reported separately by the current task's QA delivery. Historical logs and screenshots do not replace those results.
- No standalone official 4EIGNLABZ logo was found in the archives. The login text wordmark and app monogram are placeholders, not recovered official logo artwork.
- Google OAuth round-trip verification, invitation/provider configuration, deployed RLS, and real Google Drive media access remain unverified. Supply any required credentials only through secure environment/provider settings; never through chat or committed files.
- General-purpose ChatGPT authentication for this standalone app was not established from official sources. The requested provider remains unavailable rather than simulating authentication.
- The local development server can be tested on loopback with `HQ_LOCAL_DEVELOPMENT=true`. An externally hosted preview requires configured private access and an authorized private host; no public or production preview is implied.

Source recovery is no longer a blocker. The remaining blockers concern brand artwork, authorized live integration configuration, and private hosted delivery.
