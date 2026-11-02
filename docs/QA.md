# HQ3 development verification

Verified on 2026-11-02 in the isolated Codex development environment. These results apply to this reconciled branch, not to the production Site or hosted Supabase project.

## Executed checks

| Check | Result |
| --- | --- |
| Locked application dependency installation | Passed (`npm ci`); browser/SQL test dependencies subsequently pinned in the lockfile. |
| `npm run lint` | Passed, no errors or warnings. |
| `npm run typecheck` | Passed. |
| `npm test` | 84 tests passed; 0 failed, skipped, cancelled, or todo. |
| `npm run test:security` | 129 PostgreSQL assertions passed: 44 historical, 36 roles/progress, 14 Drive metadata, 35 private registration. |
| `npm run build` | Passed with Next.js 16.4.3, including TypeScript and server routes. |
| Browser QA | 17 scenarios, 202 assertions passed; 0 failed. |
| Authentication protocol browser QA | 8 scenarios passed using the real Supabase SDK with intercepted HTTP fixtures; no live OAuth claim. |
| Browser isolation | 0 uncaught browser errors, external HTTP attempts, or live Drive API calls in the demo suite. |
| Source preservation | Historical Supabase migration and public project configuration remain byte-identical to the uploaded HQ2 baseline. |

Node.js 24.19.0, npm 11.9.0, React 19.2.4, Playwright 1.62.1, system Chromium, and PGlite 0.5.13 were used. SQL tests execute only in an isolated in-memory PostgreSQL engine and roll back their fixtures. No test account or schema was created in the hosted project.

The runner uses `--test-isolation=none` because this environment's default Node/tsx child isolation initially reported file-level results instead of individual tests. The final run explicitly executed all 84 named tests. Restricted subprocess execution also prevented the first development bind and Next TypeScript child process; authorized execution resolved those environment failures without disabling type checks or package verification.

## Browser behavior verified

- Calendar defaults to Week. Today/Week/Month, account filtering, search, empty results, new posts, caption save/reload, review comments, and date/time editing work with demo fixtures.
- Drag scheduling preserves Puerto Rico wall time and independent task progress.
- Managers can change task progress while owner-only approval rules remain intact. Read-only members cannot mutate posts, progress, comments, or media.
- Post dialogs preserve unsaved changes, restore focus, and prevent focus moving into background controls. Native browser chrome can receive focus at the browser's tab boundary; that is distinct from background-page focus.
- Current/Future Feed, both account selectors, collaborative post membership, and screenshot-reference image dialogs work.
- A 26 MiB local file uploads into the browser session, previews, downloads with matching SHA-256, attaches to a post, and unlinks without removing its original. Offline Drive protocol tests also exercise 32 MiB resumable uploads using injected provider responses.
- No horizontal overflow at 320, 390, 768, and 1440 CSS pixels. Reduced-motion behavior and mobile keyboard controls passed. This is Chromium emulation, not physical iPhone/Safari verification.
- Normal `/` and an empty `/auth/callback/` show a safe signed-out screen, a Google action, a disabled ChatGPT action, and no password/signup form or authenticated workspace data. The demo suite does not click OAuth. The separate authentication suite clicks the real Google action and verifies the SDK against intercepted HTTP responses; no live login is claimed.
- Preview access tests verify default-deny pages/assets, production rejection of the local bypass, expiring/tamper-resistant sessions, secure cookie attributes, and compatibility with bearer-authenticated media APIs.

Machine-readable browser results are in [browser-qa-results.json](browser-qa-results.json). The reproducible runner is `scripts/browser-qa.cjs`; run `npm run test:browser` with the loopback development server active. Screenshots are indexed in [evidence/README.md](evidence/README.md).

## Login → Calendar follow-up

The compact weekly-intention disclosure preserves editing and reload persistence while bringing the first mobile post from approximately y=845 to y=613 at 390px width. The calendar now provides an explicit no-match state and reset, accessible New post naming and scheduling descriptions, count-labeled Month days that open Today, and a visible mobile sign-out control. Fresh authenticated identities start on Calendar/Week; successful callbacks return to the root route.

Auth recovery distinguishes normal signed-out state from cancellation, expired codes, unverified/uninvited identities, network failures, and configuration errors. SDK initialization completes before callback parameters are removed. Failed callbacks cannot silently reuse an old session. Bounded Auth requests (including response bodies), SDK import, and workspace loads prevent indefinite loading. Sign-out revokes the current session; pending pre-logout loads cannot restore UI data.

The separate `npm run test:auth-browser` runner drives the real Supabase browser SDK with HTTP-intercepted synthetic identities: desktop/mobile Google → PKCE S256 → verifier-matched token exchange → verified membership → Calendar/Week, reload/session restoration, sign-out, metadata privilege forgery denial, unverified identity denial, cancelled/orphan/expired callbacks, and retry after connection failure. It never seeds authentication storage or calls a live provider. See [auth-browser-results.json](auth-browser-results.json). Six additional captures use explicitly synthetic fixtures; none represent live private content.

One initial new calendar test failed because its unscoped Today locator matched both date navigation and the segmented control. The locator was corrected to the Calendar view group; all 17 scenarios then passed. An initial auth denial selector also needed updating to the redesigned heading; the complete protocol suite was rerun after correction. No assertions were disabled.

## Integration and delivery limits

Google OAuth is implemented with Supabase PKCE and verified membership. The live provider configuration could not be read: the environment proxy returned `403 Forbidden` while connecting to the Supabase host. Live OAuth, deployed RLS, and the private-signup hook remain unverified/unapplied. No privileged memberships were provisioned. ChatGPT authentication remains unavailable because a supported relying-party flow was not established.

Drive is implemented behind a default-disabled server boundary. Dedicated credentials, an authorized test folder/access model, reviewed migrations, and live verification are outstanding. The ambient Google credential binding was not assumed to grant folder access. Calendar cards retain historical primary-media thumbnails; private Drive originals can be loaded from post details. Large browser video previews currently use Blob memory; physical-device profiling and persistent cross-screen upload resumption remain limitations.

No shared hosted preview exists. The development server is loopback-only; hosted preview access fails closed without secure credentials. The PWA worker is network-only and does not cache private data. The standalone official logo was not supplied; the text wordmark and app monogram are placeholders.

GitHub API access is denied by the environment proxy, so pull-request creation is blocked. Required GitHub/Supabase/Google network additions and reusable installation/startup instructions were saved in an environment draft. Saving that draft did not apply runtime networking or publish an environment snapshot or application.

No merge into main, production deployment, production Site edit, Dragon Ball Hunt project edit, live migration, or original-file deletion occurred.

## Separate synthetic staging preparation

`npm run test:staging` builds and runs the actual production server locally using temporary credentials kept in memory. All seven scenarios and 392 assertions pass, with 12 fresh desktop/mobile screenshots. It tests anonymous denial for pages, actual JS assets and app-shell files; protected Login → Calendar Today/Week/Month → Feed views; synthetic image rewrites; CSP; and API denial even with the Drive enable flag deliberately set. The root/callback pages also select visual-only login at build time in staging, independently of proxy rewrites. Generated Netlify output is excluded from source lint/type checking.

The pinned Netlify adapter's offline build completed Next.js compilation and server-function packaging but failed during Edge bundling because download access is blocked. Direct probes to the Netlify API and Deno/Edge download endpoints returned proxy tunnel403. This is not a successful hosted deployment. No account/project/deployment was created. Follow [the exact separate draft setup](staging-preview.md); the hosted verification command remains unrun until an actual URL and authorized hosting access exist.
