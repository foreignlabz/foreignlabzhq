# 4EIGN CONTENT HQ 3.0 — Codex instructions
- Preserve the original production Site. Never merge to main or deploy production without explicit approval.
- The /preview route is a standalone responsive visual prototype, using DemoRepository only; it must never claim live persistence.
- Preserve Supabase as the source of truth for accounts, roles, posts, captions, schedules and approvals.
- Google Drive folder ID: 1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn. Drive stores original media, not calendar rows.
- Integrate Drive only through server-side OAuth with scoped permissions; do not embed secrets or tokens in frontend. Keep files private; authorize by workspace membership and role.
- UI: soft minimal, editorial, responsive, weekly-first. Accessible keyboard navigation and visible focus states.
- Preserve original source; implement on a separate feature branch and open PR for review. Run lint, typecheck, tests, build before handoff.
- Collaborator may access assigned media and captions; verify permissions in backend/RLS, not only UI.
