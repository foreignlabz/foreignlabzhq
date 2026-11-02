# Current HQ 3.0 browser evidence

These screenshots were captured from the reconciled application on 2026-11-02 with Chromium, using only the explicitly labeled local demo workspace. They are separate from the recovered historical screenshots in `docs/recovered/evidence/`.

- `login-{desktop,mobile}.png`: design-only login; both provider buttons are disabled on this route.
- `login-signed-out-{desktop,mobile}.png`: normal signed-out entry; Google initiation is available and unsupported ChatGPT authentication remains disabled. No OAuth flow was started.
- `calendar-{today,week,month}-{desktop,mobile}.png`: each calendar view.
- `feed-{current,future}-{desktop,mobile}.png`: screenshot references and planned canonical posts.
- `media-library-{desktop,mobile}.png`: local demo library and existing post associations.
- `post-detail-{desktop,mobile}.png`: the accessible post-details dialog and independent task progress.

Desktop viewport: 1440 × 1000. Mobile viewport: 390 × 844. Full-page captures include the floating mobile navigation at its viewport position. This is browser emulation, not a physical iPhone/Safari test. Animations are disabled for screenshot capture; the functional suite separately verifies reduced-motion behavior.

The latest complete run in `../browser-qa-results.json` passed 16 scenarios and 187 assertions with no uncaught browser errors and no external service requests. It includes signed-out access at `/` and a no-code `/auth/callback/`, plus a real 26 MiB browser-local image upload, decoded preview, byte-for-byte download integrity check, attachment persistence across tabs, and unlinking without deleting the local original. All 18 screenshots were refreshed during that run.

Reproduce against a loopback development server started with `HQ_LOCAL_DEVELOPMENT=true`:

```sh
node scripts/browser-qa.cjs
```

The runner uses the pinned Playwright dependency and `/usr/bin/chromium` (override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), fresh browser contexts, and blocked external HTTP requests. It visits `/preview/`, `/login-preview/`, and the unauthenticated entry/callback routes. It never performs live OAuth or writes to Supabase/Google Drive. These results do not establish live integration readiness.

Post-detail captures use the actual viewport to avoid including page content below the native modal backdrop in a full-document composite.
