# HQ 3.0 handoff
This branchless source snapshot is derived from the 2026-10-28 Next.js source ZIP. The 2026-10-31 manager-progress patch is NOT applied because its Cloudflare D1/R2 backend is architecturally different from the Supabase repository. Reconcile deliberately before merging.

Prototype route: `/preview`. It uses `useHQ(true)` (DemoRepository) and cannot write production data. Original `/` route remains unchanged. No live deploy has occurred.

Next steps: (1) confirm Node/Next build; (2) replace demo fixture with 4EIGN-specific mock data; (3) review visual preview; (4) implement Google Drive server OAuth and resumable upload; (5) stage Supabase schema changes with Drive IDs; (6) test owner/collaborator RLS; (7) create isolated PR and preview deployment, only after approval.

Google Drive folder: https://drive.google.com/drive/folders/1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn
