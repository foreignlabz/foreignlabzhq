# 4EIGNLABZ — Content HQ 3.0

A mobile-first creative workspace for planning posts, reviewing media, and composing a future feed. HQ3 uses Next.js, React, and Supabase, with prepared server-side Google Drive integration. Its Liquid Glass × Subtle Grunge interface brings Calendar, Media Library, and Feed Preview into one workspace.

Development branch: `feat/hq3-liquid-glass-workspace`. Do not merge into `main`, publish production, modify the existing production HQ Site, or modify the separate Dragon Ball Hunt project. Read [AGENTS.md](AGENTS.md) before changing the project.

## Run locally

Use Node.js 24 and npm. From this checkout:

```bash
npm ci
HQ_LOCAL_DEVELOPMENT=true npm run dev -- --hostname 127.0.0.1 --port 3000
```

Use `/preview/` or `/demo/` for the fictional workspace. These modes require no production credentials and clearly identify demo state. The default screen is Calendar with Week selected; Today and Month are also available. `/feed-preview/` opens the integrated feed planner, `/login-preview/` shows the disabled login design preview, and `/legacy/` preserves the HQ2 demo UI.

The root route `/` uses the Supabase adapter, and `/auth/callback/` handles its OAuth return. Do not use demo role controls as evidence that live authentication or database permissions work.

To test a production build locally:

```bash
npm run build
HQ_LOCAL_DEVELOPMENT=true npm run start -- --port 3000
```

`HQ_LOCAL_DEVELOPMENT` is only for loopback development. External requests fail closed unless the private-preview gate is configured. No public preview is deployed by these commands.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` runs those four checks in sequence. Tests cover repository behavior, calendar/feed planning, permission contracts, and prepared integration logic. Embedded PostgreSQL verification has a separate harness under `supabase/tests/`; it must never be pointed at production casually. See the current QA delivery for actual executed results, browser screenshots, and known failures. Old reports under `docs/recovered/` are historical evidence only.

## Configuration and live integration status

Use secure environment/provider settings for credentials; never put secret values in chat, commits, browser bundles, screenshots, or logs. `.env.example` documents configuration names. The recovered public Supabase configuration is retained, but the project ID/public client configuration does not establish authorization to migrate or modify the existing backend.

- **Authentication:** Google OAuth wiring and a callback are implemented. A real OAuth round trip, invitation settings, and deployed memberships/RLS remain unverified. ChatGPT sign-in is visibly unavailable because a supported standalone third-party authentication flow was not established.
- **Permissions:** Owners, managers, read-only brand members, and legacy collaborators are represented. Additive roles/progress migrations are prepared for review; no hosted database migration or privileged account provisioning has been performed.
- **Media:** The demo supports session-local files and preserves original files when associations are removed. Google Drive server routes are prepared and disabled by default. Live provider credentials, authorized folder access, and a real large-file upload remain unverified. See [Drive integration details](docs/drive-integration.md).
- **Private preview:** External access requires `HQ_PREVIEW_USERNAME` and `HQ_PREVIEW_PASSWORD` in secure server settings, an authorized private host, and HTTPS. The gate supplements application authentication. No production publication or public preview is authorized.
- **Brand assets:** No standalone official logo was supplied. The text wordmark and app monogram are placeholders, not official logo artwork.
- **PWA:** Installation metadata is provided; the service worker is network-only to avoid caching private media, credentials, or API responses. Offline private-media access is not implemented.

## Source provenance

The repository began as a README-only placeholder. Four uploaded archives were recovered and reconciled: HQ2, manager progress, the responsive package supplied as `HQ3-responsive-retry.zip`, and the feed preview. Originals remain in workspace attachment storage and separate recovery staging; historical code was not deleted.

- [Source recovery audit](docs/source-recovery-audit.md)
- [Archive hashes and staging manifest](docs/archive-manifest.json)
- [Reconciliation decisions and route map](docs/reconciliation.md)
- [Google Drive implementation and limitations](docs/drive-integration.md)
- [Reusable development skills](.agents/skills/)

Feed screenshot thumbnails are reference snapshots, not a synchronized Instagram feed. HQ never publishes to Instagram automatically.
