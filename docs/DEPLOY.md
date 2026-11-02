# Private development deployment only

The current app requires a Next.js Node server for the preview gate and private Drive endpoints. The recovered static-export instructions are retained at `docs/recovered/DEPLOY.md` for provenance and do not apply to HQ3.

No hosted preview or production deployment has been created. Automatic Netlify deployment is disabled in this branch. Do not deploy to the existing ChatGPT Site or modify the Dragon Ball Hunt project.

For local development, run `HQ_LOCAL_DEVELOPMENT=true npm run dev` from the repository. The wrapper binds to loopback. This bypass works only in development and must never be enabled on a shared host.

Before sharing a development deployment, select an explicitly authorized private host, configure `HQ_PREVIEW_USERNAME` and `HQ_PREVIEW_PASSWORD` securely, use HTTPS, build with `npm run build`, and run the Next server using the host's permitted listening address. Missing access-gate configuration returns 503; unauthenticated visitors receive 401. The signed, expiring HttpOnly preview cookie allows subsequent user-bearer API calls. Verify page, asset, and API access denial from a separate unauthenticated browser before sharing a URL. Never place credentials in URLs.

The preview gate is separate from Supabase authentication/RLS. Keep Drive disabled until its dedicated credentials and additive migrations are reviewed. Do not apply migrations to the existing hosted project during preview startup. See `supabase/HQ3-DEVELOPMENT.md`, `supabase/PRIVATE-REGISTRATION.md`, and `docs/drive-integration.md`.
