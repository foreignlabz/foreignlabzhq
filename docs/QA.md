# HQ3 development verification

Verified on 2026-11-02 in the isolated Codex development environment. These results apply to this reconciled branch, not to the production Site or hosted Supabase project.

## Executed checks

| Check | Result |
| --- | --- |
| Locked application dependency installation | Passed (`npm ci`); browser/SQL test dependencies subsequently pinned in the lockfile. |
| `npm run lint` | Passed, no errors or warnings. |
| `npm run typecheck` | Passed. |
| `npm test` | 69 tests passed; 0 failed, skipped, cancelled, or todo. |
| `npm run test:security` | 129 PostgreSQL assertions passed: 44 historical, 36 roles/progress, 14 Drive metadata, 35 private registration. |
| `npm run build` | Passed with Next.js 16.4.3, including TypeScript and server routes. |
| Browser QA | 16 scenarios, 187 assertions passed; 0 failed. |
| Browser isolation | 0 uncaught browser errors, external HTTP attempts, or live Drive API calls in the demo suite. |
| Source preservation | Historical Supabase migration and public project configuration remain byte-identical to the uploaded HQ2 baseline. |

Node.js 24.19.0, npm 11.9.0, React 19.2.4, Playwright 1.62.1, system Chromium, and PGlite 0.5.13 were used. SQL tests execute only in an isolated in-memory PostgreSQL engine and roll back their fixtures. No test account or schema was created in the hosted project.

The runner uses `--test-isolation=none` because this environment's default Node/tsx child isolation initially reported file-level results instead of individual tests. The final run explicitly executed all 69 named tests. Restricted subprocess execution also prevented the first development bind and Next TypeScript child process; authorized execution resolved those environment failures without disabling type checks or package verification.

## Browser behavior verified

- Calendar defaults to Week. Today/Week/Month, account filtering, search, empty results, new posts, caption save/reload, review comments, and date/time editing work with demo fixtures.
- Drag scheduling preserves Puerto Rico wall time and independent task progress.
- Managers can change task progress while owner-only approval rules remain intact. Read-only members cannot mutate posts, progress, comments, or media.
- Post dialogs preserve unsaved changes, restore focus, and prevent focus moving into background controls. Native browser chrome can receive focus at the browser's tab boundary; that is distinct from background-page focus.
- Current/Future Feed, both account selectors, collaborative post membership, and screenshot-reference image dialogs work.
- A 26 MiB local file uploads into the browser session, previews, downloads with matching SHA-256, attaches to a post, and unlinks without removing its original. Offline Drive protocol tests also exercise 32 MiB resumable uploads using injected provider responses.
- No horizontal overflow at 320, 390, 768, and 1440 CSS pixels. Reduced-motion behavior and mobile keyboard controls passed. This is Chromium emulation, not physical iPhone/Safari verification.
- Normal `/` and an empty `/auth/callback/` show a safe signed-out screen, a Google action, a disabled ChatGPT action, and no password/signup form or authenticated workspace data. OAuth was not clicked; no real login is claimed.
- Preview access tests verify default-deny pages/assets, production rejection of the local bypass, expiring/tamper-resistant sessions, secure cookie attributes, and compatibility with bearer-authenticated media APIs.

Machine-readable browser results are in [browser-qa-results.json](browser-qa-results.json). The reproducible runner is `scripts/browser-qa.cjs`; run `npm run test:browser` with the loopback development server active. Screenshots are indexed in [evidence/README.md](evidence/README.md).

## Integration and delivery limits

Google OAuth is implemented with Supabase PKCE and verified membership. The live provider configuration could not be read: the environment proxy returned `403 Forbidden` while connecting to the Supabase host. Live OAuth, deployed RLS, and the private-signup hook remain unverified/unapplied. No privileged memberships were provisioned. ChatGPT authentication remains unavailable because a supported relying-party flow was not established.

Drive is implemented behind a default-disabled server boundary. Dedicated credentials, an authorized test folder/access model, reviewed migrations, and live verification are outstanding. The ambient Google credential binding was not assumed to grant folder access. Calendar cards retain historical primary-media thumbnails; private Drive originals can be loaded from post details. Large browser video previews currently use Blob memory; physical-device profiling and persistent cross-screen upload resumption remain limitations.

No shared hosted preview exists. The development server is loopback-only; hosted preview access fails closed without secure credentials. The PWA worker is network-only and does not cache private data. The standalone official logo was not supplied; the text wordmark and app monogram are placeholders.

GitHub API access is denied by the environment proxy, so pull-request creation is blocked. Required GitHub/Supabase/Google network additions and reusable installation/startup instructions were saved in an environment draft. Saving that draft did not apply runtime networking or publish an environment snapshot or application.

No merge into main, production deployment, production Site edit, Dragon Ball Hunt project edit, live migration, or original-file deletion occurred.
