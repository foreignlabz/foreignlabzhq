# 4EIGN Content HQ 3.0

## Scope and safety

- Work on `feat/hq3-liquid-glass-workspace`. Reuse it safely; preserve other work. Never merge into `main`, force-push, or publish production.
- Each cloud task already has an isolated environment. Use its existing checkout; create a worktree only if the user explicitly requests one.
- Do not modify the existing production ChatGPT Site, the Dragon Ball Hunt project, historical versions, or production databases. The `@dragonballhuntpr` account in this application's feed preview is in scope; the separate project is not.
- Never print, commit, or embed credentials. Use mock data when live integration configuration is unavailable, and clearly label demo state. Mock sessions must never grant live backend access.
- Do not apply database migrations or change live authentication, permissions, storage, or provider settings without authorization for the concrete change. Prepare reviewable migrations and verification first.
- Use specialized agents for independent work when supported. Give each agent explicit file ownership and review the combined result.

## Source recovery first

The starting commit contains only a README. The source archives requested from the user are:

1. `4EIGN-HQ-v2-source.zip`
2. `manager-progress-source-handoff.zip`
3. `4EIGN-HQ-3.0-responsive-prototype.zip`
4. `4EIGN-HQ-3.0-feed-preview.zip`

Do not claim access to ChatGPT Library or recovered source without evidence. Request uploads when files are unavailable. Before extracting, list archive contents and reject traversal paths, absolute paths, unsafe symlinks, and unreasonable expanded sizes. Extract each package into a separate staging directory outside the checkout. Preserve original archives and compute hashes. Inspect package instructions and scripts before execution. Compare manifests, routes, schemas, and assets; document provenance and reconcile deliberately. Do not overwrite or delete older versions blindly. Follow the recovered application's toolchain and architecture instead of choosing a new stack prematurely.

## Product requirements

- Mobile-first responsive PWA; Liquid Glass × Subtle Grunge, warm whites, lavender, translucent panels, chrome edges, restrained grain, readable typography, and accessible contrast.
- Login uses the official logo asset, with Google OAuth through Supabase. Do not invent the official logo. Investigate official ChatGPT authentication support; never render an enabled provider that cannot authenticate.
- Private registration and verified identities. Default-deny server authorization through Supabase RLS and trusted identity/role mapping. Client-side visibility is not an authorization boundary.
- Requested role assignments: owners `foreignlabz@gmail.com` and `eightysixthewrld@gmail.com`; social media manager `marianabeatrizofficial@gmail.com`; read-only brand member `Thecmco@gmail.com`. Treat these as requirements, not evidence of provisioned or verified accounts. Do not create privileged accounts automatically.
- Calendar is the initial authenticated screen. Today, Week (default), and Month views; account filters; cards with thumbnail, title, time, account, status; animated details; permission-aware caption editing and scheduling. Drag-and-drop must have keyboard and touch-friendly alternatives.
- Three primary tabs: Calendar, Media Library, Feed Preview. Floating glass navigation must respect mobile safe areas and keyboard focus.
- Supabase stores metadata. Google Drive stores private originals, including files over 25 MiB. Support authorized upload, preview, download, removal of associations, and post associations. Removing an association must not silently delete an original file.
- Feed previews support `@4eignlabz` and `@dragonballhuntpr`, Current/Future views, three-column grids, and collaborative posts. Use screenshot-derived thumbnails when available; never present mock feed data as live Instagram data. Never auto-publish to Instagram.
- Motion: microinteractions 150–250 ms, panels 250–450 ms, major transitions 450–700 ms. Respect reduced motion; constrain blur and animation cost on mobile.
- Cache only suitable public app-shell assets for the PWA; do not persist private media, tokens, or sensitive API responses in service-worker caches.

## Existing infrastructure references

- Supabase project: `4EIGN HQ`, ID `gytldbxbvnrxhsprovfm`.
- Google Drive folder: `4EIGN CONTENT HQ`, ID `1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn`.
- Production Site (do not modify): `https://four-eign-content-hq.fvisou.chatgpt.site/`.

IDs identify resources; they do not prove access or authorize writes. Never place provider secrets or Supabase privileged keys in browser bundles. A private preview must have actual access control; an obscure public URL is insufficient.

## Reusable skills

Use relevant instructions in `.agents/skills/`:

- `hq3-design-system`
- `hq3-auth-security`
- `hq3-calendar-workflow`
- `hq3-google-drive-media`
- `hq3-instagram-feed-preview`
- `hq3-mobile-qa`

## Verification and delivery

After source recovery, use its lockfile and pinned tools; run dependency installation, lint, type checking, build, and available tests. Record actual commands and results. Exercise authentication and role denial, calendar persistence and scheduling, media access, responsiveness, reduced motion, and keyboard navigation. Screenshots supplement functional checks; they do not prove backend security.

Deliver a technical audit, changes, login/calendar/mobile/feed screenshots, test results, integration status, and remaining blockers. Create a reviewable pull request without merging when GitHub access allows. Publish only an explicitly private development preview when supported. Never invent screenshots, test passes, PR links, deployment links, or integration readiness. Keep current-instance execution, saved environment configuration, and publication status separate.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
