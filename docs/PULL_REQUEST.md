# Reconcile HQ sources into a private Liquid Glass creative workspace

The repository previously contained only a README, while the supplied HQ2, responsive, feed, and manager packages diverged in architecture and functionality. This change retains the HQ2 Next.js/Supabase foundation, integrates the responsive and Feed Preview additions, and ports Manager Progress behavior without importing its incompatible Cloudflare backend.

The new mobile-first workspace opens on Calendar/Week and supports Today/Month views, post editing and rescheduling, independent manager progress, comments, collaborative account previews, and a private media library. It includes Google PKCE login, explicit read-only enforcement, a prepared invite-only signup hook, default-disabled secure Drive routes, and a fail-closed development-preview gate. Historical source/evidence and the original Supabase migration/configuration are preserved.

Validation: lint, TypeScript, and production build pass; 69 unit/contract tests and 129 isolated PostgreSQL assertions pass; 16 Chromium scenarios with 187 assertions pass. The browser suite verifies a 26 MiB local media download hash and records 18 screenshots. See `docs/QA.md` and `docs/reconciliation.md`.

Live OAuth, hosted RLS/hook activation, Google Drive credentials/folder access, and private hosting remain unverified. Migrations are reviewable only and were not applied to the existing Supabase project. ChatGPT login is disabled. No production deployment or merge is included.
