# QA record — 2026-10-28

## Passed

- `npm run check`: ESLint, TypeScript, **18 Node tests**, Next.js optimized production build.
- `npm audit --omit=dev`: **0 vulnerabilities reported** in the installed production dependency graph (point-in-time result in npm-audit.json).
- Embedded PostgreSQL/PGlite: real migration + **44 SQL authorization assertions** using test-only Auth/Storage schema stubs. See supabase/VERIFICATION.md for scope/hash.
- Cloud browser desktop view, approximately 1188 CSS px wide.
- Narrow native cloud browser at **400 CSS px**, using browser zoom and window resize. No horizontal overflow (document scroll width388 <= viewport400). Device emulation was organization-disabled and was not bypassed; this is responsive-width QA, not physical-phone testing.
- Create fictional post; reload; saved post remains; comment added and visibly persisted.
- Image chosen through browser file chooser, stored in demo, saved post rendered the image.
- Collaborator cannot edit an approved post: controls disabled, no approve/save/delete action, comments still available.
- Owner approves an in-review post; reopening shows Aprobado.
- Escape closes modal; reopen and Cancel/Close work; demo role changes dismiss editors.
- Mobile calendar renders agenda, hides desktop month grid; month forward/back changes correctly.
- Mobile feed has three columns (114px each at tested width).
- Demo reset restores six fictional posts and owner role.
- Clean desktop and mobile screenshots saved to Library; screenshots contain only fictional sample content, no credentials or personal data.

## Limits / not passed by implication

- **Root is now configured for the authorized Supabase project and renders private login without a session.** `/demo/` is explicitly separate and never connects to the backend. Production authenticated login, session refresh, live owner/collaborator flows, and Storage HTTP uploads/signing have not been browser-tested; no owner Auth identity or membership was auto-created.
- Parent reports remote migration applied and security advisors returned no notices. Remote rollback authorization test outcome was uncertain; **do not claim hosted RLS test execution passed**. No production application data was entered by this build task.
- SQL structural tests are not runtime policy proof; embedded PostgreSQL tests are not equivalent to a complete hosted Supabase HTTP stack.
- No Vercel deployment or external reachable app URL. Internal cloud preview `http://127.0.0.1:4173/` is not a user-public URL.
- No actual iOS/Android hardware, email delivery, video upload service, paid hosting, invitations, or Instagram integration tested.
- Browser extension emitted metadata bridge errors from `chrome-extension://...`; these were unrelated to the application. No app exception was observed in tested flows.

## User-visible images

- dashboard-desktop.png: libfile_aed5c5dde70081919ab689a1518ae3ed, version0.
- dashboard-mobile.png: libfile_bf55cf99626881919d579a58e15fe988, version0.

Additional internal evidence: calendar-mobile.png and post-mobile.png.

## Authorized integration update

- Source now includes the approved project URL and browser-safe publishable key in `lib/public-config.ts`; there are no privileged keys or user credentials.
- Root `/` visibly shows login only without a session; `/demo/` remains the independent local fixture sandbox.
- Next.js static export succeeds; `out/index.html`, `out/demo/index.html`, JS/CSS chunks and Netlify `_headers` are generated.
- No email, password, invitation or hosting purchase sent/performed by the build agent.
- Compiled `out/` was copied to a local static-preview root and served through the supported cloud preview daemon: production `/` showed login only, and `/demo/` showed the isolated fixture UI. This check used the built static files, not only Next dev.
