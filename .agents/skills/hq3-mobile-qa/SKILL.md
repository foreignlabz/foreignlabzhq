---
name: hq3-mobile-qa
description: Run reproducible functional, accessibility, responsive, and security-oriented QA for the 4EIGN Content HQ 3.0 private development workspace.
---

# HQ3 mobile QA

## Establish the test environment

- Read `AGENTS.md`, package manifests, lockfiles, CI scripts, and the relevant feature skills. Use repository-supported tooling and lockfile-preserving installation.
- Work on `feat/hq3-liquid-glass-workspace`. Never merge main, publish production, modify the existing HQ Site, alter the Dragon Ball Hunt project, or reset historical databases.
- Use mock data or isolated authorized test services. Never run destructive tests against production. Record which backend and data mode each result covers without exposing credentials.
- Run dependency installation, lint, type checking, build, and available tests. Preserve exit statuses and actual test counts; do not label absent or skipped checks as passed.

## Functional coverage

| Area | Required checks |
| --- | --- |
| Login | Official logo, Google flow/cancel/error, private membership denial, session restoration, sign-out, and honest ChatGPT availability |
| Permissions | Anonymous/nonmember denial; owner/manager content edits; read-only member denial through direct server/database requests; no self-promotion |
| Calendar | Default Week after login, Today/Week/Month navigation, filters, complete post cards, panel focus, caption editing, drag and accessible rescheduling, persistence/error rollback |
| Media | Authorized preview/download, upload integrity above 25 MiB, interruption handling, private-file denial, attachment removal without original deletion |
| Feed | Both accounts, Current/Future modes, three columns, deterministic ordering, collaborative posts, missing-media states, no automatic publication |
| Navigation/PWA | Three tabs, back/forward behavior where supported, safe-area layout, manifest/service-worker behavior, safe update handling, private-data cache exclusions |

## Responsive and accessibility checks

- Exercise representative phone widths such as 320, 375, 390, and 430 CSS pixels, plus tablet and desktop. Check portrait/landscape, browser zoom, on-screen keyboard layout, long titles/captions, and empty/crowded screens.
- Test keyboard-only use, visible focus, accessible names, semantic controls, panel focus return, reduced motion, target sizing, contrast over glass, and non-color status indicators.
- Verify floating navigation does not cover the final card or focused control. Avoid page-wide overflow and hover-only editing controls.
- Use browser automation when available and inspect actual screenshots. Emulation is not physical iPhone/Safari verification; report that distinction.
- Profile costly scrolling and transitions if visible jank exists. Prefer transform/opacity and verify reduced-motion overrides for all animation classes.

## Evidence and delivery

Capture login, Today, Week, Month, mobile, and Feed Preview screenshots from the application actually under test. Keep fixtures free of private user data. Store reproducible commands, environment versions, test results, diagnosed failures, and incomplete integrations in the technical audit.

Report authentication, RLS, and Google Drive status separately from UI/mock test success. A build does not prove a live integration. A port or process does not prove application readiness; make representative functional requests.

Create a pull request only through available authorized GitHub tooling, preserving the requested development branch and leaving it unmerged. Verify that any development preview is private before sharing it. If private hosting or PR creation is unavailable, state the concrete blocker; never substitute a production or public deployment.
