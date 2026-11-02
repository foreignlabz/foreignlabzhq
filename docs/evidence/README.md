# Current HQ 3.0 browser evidence

These screenshots were captured from the reconciled application on 2026-11-02 with Chromium, using the local application with demo fixtures, signed-out entry routes, and the separately documented intercepted authentication protocol. They are separate from the recovered historical screenshots in `docs/recovered/evidence/`.

- `login-{desktop,mobile}.png`: design-only login; both provider buttons are disabled on this route.
- `login-signed-out-{desktop,mobile}.png`: normal signed-out entry; Google initiation is available and unsupported ChatGPT authentication remains disabled. No OAuth flow was started.
- `calendar-{today,week,month}-{desktop,mobile}.png`: each calendar view.
- `feed-{current,future}-{desktop,mobile}.png`: screenshot references and planned canonical posts.
- `media-library-{desktop,mobile}.png`: local demo library and existing post associations.
- `post-detail-{desktop,mobile}.png`: the accessible post-details dialog and independent task progress.

Desktop viewport: 1440 × 1000. Mobile viewport: 390 × 844. Full-page captures include the floating mobile navigation at its viewport position. This is browser emulation, not a physical iPhone/Safari test. Animations are disabled for screenshot capture; the functional suite separately verifies reduced-motion behavior.

The latest complete run in `../browser-qa-results.json` passed 17 scenarios and 202 assertions with no uncaught browser errors and no external service requests. It includes signed-out access at `/` and a no-code `/auth/callback/`, plus a real 26 MiB browser-local image upload, decoded preview, byte-for-byte download integrity check, attachment persistence across tabs, and unlinking without deleting the local original. All 18 screenshots were refreshed during that run.

Reproduce against a loopback development server started with `HQ_LOCAL_DEVELOPMENT=true`:

```sh
node scripts/browser-qa.cjs
```

The runner uses the pinned Playwright dependency and `/usr/bin/chromium` (override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), fresh browser contexts, and blocked external HTTP requests. It visits `/preview/`, `/login-preview/`, and the unauthenticated entry/callback routes. It never performs live OAuth or writes to Supabase/Google Drive. These results do not establish live integration readiness.

Post-detail captures use the actual viewport to avoid including page content below the native modal backdrop in a full-document composite.

## Authentication protocol captures

The separate `npm run test:auth-browser` suite exercises the real Supabase SDK with intercepted synthetic HTTP responses. Its eight scenarios pass; see `../auth-browser-results.json` for the current run and assertions. These six captures are actual browser screenshots, but their account and calendar content are fixtures, not live Supabase data:

- `auth-flow-calendar-{desktop,mobile}.png`: Google button → PKCE callback → verified fixture membership → Calendar/Week.
- `auth-flow-signed-out-{desktop,mobile}.png`: completed current-session sign-out.
- `auth-flow-uninvited-denied.png`: verified account with no trusted workspace membership denied.
- `auth-flow-cancelled.png`: cancelled callback with safe recovery and sanitized URL.

The protocol runner does not insert auth storage manually; the real SDK persists its session after the intercepted token exchange. Google/Supabase endpoints never receive these test requests. All 24 current screenshots are separate from historical archive evidence.

## Protected synthetic staging captures

`staging-{login,today,week,month,feed-current,feed-future}-{desktop,mobile}.png` are 12 actual captures from a password-protected local production build. This mode uses synthetic records **and** generated artwork; original screenshot-reference assets are replaced. The seven staging scenarios and 392 assertions pass. See `../staging-browser-results.json` and `../staging-preview.md`. These captures demonstrate the prepared application, not a live hosted URL or physical iPhone test.
