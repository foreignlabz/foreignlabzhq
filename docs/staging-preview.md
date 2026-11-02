# Private HQ 3.0 staging for iPhone review

## Current status

The new interface is on `feat/hq3-liquid-glass-workspace`, not on the old production Site. This Codex environment has no shareable port/preview service, hosting login, or hosting credentials. No hosting project or deployment has been created, and there is no preview URL yet.

The prepared staging build uses fictional records and synthetic artwork. Login providers are disabled; **Explore demo workspace** opens Calendar. Today/Week/Month and Current/Future Feed remain interactive. Changes stay in that browser's demo storage. A separate password protects pages, JS bundles, and assets. All API routes are denied, Auth entry routes show the visual login, and CSP prevents external connections. Drive is also disabled inside its service even if its enable flag is accidentally set.

**Recommended host: a new Netlify site with a draft deployment.** Netlify CLI 27.16.2 supports an initial draft without a production deploy. Vercel CLI 65.9.0 requires a fresh project's first deployment to be Production, so it is not the recommended route under this task's restriction. No Git auto-publishing, custom domain, production promotion, Supabase migration, or Google login configuration is needed.

## One-time setup on a computer

Use Node.js 24, npm, Git, and Bash (for the masked password prompt). Viewing the result needs only Safari on your iPhone. The commands below use your own hosting account; do not send passwords or tokens in chat.

### 1. Get the development branch and sign in to Netlify

Use a new folder to avoid changing an existing checkout:

```bash
git clone --single-branch --branch feat/hq3-liquid-glass-workspace https://github.com/foreignlabz/foreignlabzhq.git foreignlabzhq-staging
cd foreignlabzhq-staging
npm ci
npx --yes netlify-cli@27.16.2 login
```

Complete the browser login using your Netlify account. GitHub access to the private repository is a separate prerequisite; use your existing GitHub authentication.

### 2. Create a NEW empty staging site

Replace `yourname` with a unique lowercase suffix. Select your intended Netlify team when prompted:

```bash
npx --yes netlify-cli@27.16.2 sites:create --name four-eign-hq3-staging-yourname
```

This creates an empty site and links this local checkout to it. Do not select an existing site, import the repository through the dashboard, connect a production domain, or add `--with-ci`. Creating an empty site does not publish the app. Keep Git integration/automatic publishing disconnected.

### 3. Configure ONLY this new site's variables

In the new site's Netlify dashboard, open **Project configuration → Environment variables** (some dashboards call it Site configuration). Add these values securely:

| Variable | Value |
| --- | --- |
| `HQ_STAGING_DEMO` | `true` |
| `HQ_DRIVE_ENABLED` | `false` |
| `HQ_PREVIEW_USERNAME` | A dedicated preview username you choose |
| `HQ_PREVIEW_PASSWORD` | A new password-manager-generated password, at least 24 characters |

Apply each variable to **All deploy contexts** and **Builds + Functions**, or **All scopes**. Functions scope includes Edge Functions. This is a new synthetic-only project; all-context variable configuration does not publish a production deployment. It avoids ambiguity between a manual draft's runtime context and the CLI's `deploy-preview` build context.

Mark the password as secret when available. Do not add Supabase, Google, Drive, or production-site credentials. Do not set `HQ_LOCAL_DEVELOPMENT` on this host. The app already has its public Supabase identifiers, but staging never initializes a live session or calls the service.

### 4. Create a password-protected DRAFT

Provide the **same** username and password locally for the build. The password prompt below does not echo the value or place it in shell history. It stays in the current process environment until unset. This also works when Dashboard secrets cannot be read back by the CLI.

```bash
read -r -p 'Preview username: ' HQ_PREVIEW_USERNAME
read -r -s -p 'Preview password (same as Netlify): ' HQ_PREVIEW_PASSWORD
printf '\n'
export HQ_PREVIEW_USERNAME HQ_PREVIEW_PASSWORD
export HQ_STAGING_DEMO=true
export HQ_DRIVE_ENABLED=false

npx --yes netlify-cli@27.16.2 deploy --draft --context deploy-preview --json > /tmp/hq3-netlify-deploy.json
```

CLI 27.16.2 builds by default. `netlify.toml` uses the pinned Next.js adapter and `build:staging`, which refuses a Netlify production build context, absent protection, weak passwords, or enabled Drive. Do not add `--prod`, `--prod-if-unlocked`, or `--alias`; do not click Publish deploy in the dashboard. A failed build/upload means there is no verified preview yet.

### 5. Verify the draft and obtain its URL

Only after the deploy command succeeds:

```bash
export HQ_STAGING_URL="$(node -e 'const d=require("/tmp/hq3-netlify-deploy.json");if(!d.deploy_url)throw Error("Missing draft URL");process.stdout.write(d.deploy_url)')"
npm run test:staging-host
unset HQ_PREVIEW_PASSWORD HQ_PREVIEW_USERNAME
```

The checker makes read-only requests. It requires an HTTPS draft hostname, tests anonymous denial for pages/assets/bundles, verifies authenticated demo pages, checks secure cookies and no-store/CSP headers, confirms synthetic image substitution, and confirms disabled APIs. It prints `status: passed` and `previewURL` only when those checks pass. Never promote the draft to fix a verification failure. If verification fails, keep the URL private and inspect the error; the checker prints no credentials.

The returned URL is the deploy-specific address resembling `https://DEPLOY-ID--four-eign-hq3-staging-yourname.netlify.app`, not the site's bare production address. Do not use this example as a real URL. Send back only the actual returned URL if you want further review; keep the password in your password manager or another approved secure sharing channel.

## On your iPhone

1. Open the verified `previewURL` in Safari and enter the dedicated preview username/password when prompted.
2. Review **Login**, then tap **Explore demo workspace**.
3. Calendar opens on **Week**. Use the segmented control for **Today** and **Month**.
4. Open **Feed Preview** using the top review links or floating navigation; switch **Current Feed/Future Feed** and accounts.

Direct paths under the same verified hostname are `/login-preview/`, `/preview/`, and `/feed-preview/`. All remain password-protected. Providers are intentionally disabled in this staging demo; the hosting password is not a Google/Supabase login. Closing a tab may retain the preview cookie; use a private browsing tab for a fresh access check. The app's cookie lasts up to eight hours; rotating the password requires changing the runtime variable and creating a new draft. Already-created drafts must be retired/deleted through the hosting dashboard when no longer needed.

## Verification completed in Codex

- Locked adapter installation: `@netlify/plugin-nextjs@5.16.5`.
- Lint, TypeScript, 84 unit/contract tests passed.
- Next.js staging build and seven production-server browser scenarios passed: 392 assertions, 12 desktop/mobile screenshots, no external requests. The server deliberately had `HQ_DRIVE_ENABLED=true` during these tests; staging still denied API access. See [staging-browser-results.json](staging-browser-results.json).
- `netlify build --offline --context deploy-preview` completed the Next.js build and server-function packaging. Edge-function packaging stopped at `fetch failed`. Read-only probes to `dl.deno.land`, `edge.netlify.com`, and `api.netlify.com` each returned proxy tunnel `403 Forbidden`. Hosted adapter completion, credentials propagation, actual iPhone/Safari behavior, and URL verification remain unverified.

A normal computer with access to Netlify/Deno can perform the steps above. To complete them inside Codex instead, this environment needs an authorized Netlify account binding and network access to Netlify APIs and required Deno/Edge download destinations. Do not paste tokens here.

The original Supabase configuration and historical migration are unchanged. The existing HQ2 production Site, `main`, and the separate Dragon Ball Hunt project remain untouched.

## Implementation references

The commands were checked against integrity-verified official package implementations, not a successful hosted deployment:

- [Netlify CLI 27.16.2 metadata](https://registry.npmjs.org/netlify-cli/27.16.2)
- [Netlify CLI source](https://github.com/netlify/cli)
- [Next.js adapter 5.16.5 metadata](https://registry.npmjs.org/@netlify/plugin-nextjs/5.16.5)
- [OpenNext Netlify adapter](https://opennext.js.org/netlify)
