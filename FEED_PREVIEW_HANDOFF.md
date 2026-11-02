# HQ 3.0 Feed Preview handoff

- New isolated route: `/feed-preview`. Existing `/`, `/preview`, Supabase repository, and production Site are untouched.
- 12 cropped visual thumbnails from user-provided screenshots are stored in `public/feed/4eignlabz/01.jpg` through `12.jpg`.
- Current view reproduces the visible screenshot grid order. Snapshot metrics are not live.
- Future view accepts local image files, shows drafts above existing grid, allows reorder and remove. Drafts are ephemeral browser-session state; nothing is published, persisted or uploaded.
- Second account is an intentionally empty placeholder until source assets are provided.
- Next: replace cropped screenshots with original assets; implement authenticated Google Drive upload server-side and persist Drive file IDs + preview URLs in Supabase, enforce owner/manager access, add storage limits and tests. Do not expose OAuth credentials in browser.
