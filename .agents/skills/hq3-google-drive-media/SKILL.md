---
name: hq3-google-drive-media
description: Prepare and verify secure Google Drive original-media storage and Supabase metadata associations for 4EIGN Content HQ 3.0.
---

# HQ3 Google Drive media

## Safety and discovery

- Read `AGENTS.md`, recovered upload/media code, database schema, and authentication policies. Use `feat/hq3-liquid-glass-workspace`; never merge main, deploy production, modify the existing HQ Site, or modify the Dragon Ball Hunt project.
- The intended folder is `4EIGN CONTENT HQ`, ID `1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn`. Its ID is not proof of access or permission to change it.
- Inspect credential binding names and presence without revealing values. Confirm the supported Google authorization mechanism and least-privilege folder access before live operations. Never expose service credentials, refresh tokens, access tokens, or resumable session URLs to logs or public clients.
- Use clearly labeled fixtures when access is missing. Do not create public Drive sharing permissions or copy production files into public fixtures.

## Storage and authorization boundaries

- Keep original photo/video bytes in Google Drive and post/media metadata and associations in Supabase. Inspect existing metadata before proposing new tables or migrations.
- Route protected operations through an authenticated server endpoint that verifies workspace membership, role, and resource scope. Do not accept arbitrary Drive IDs or URLs as proof that a caller may access a file.
- Restrict uploads and attachment changes to permitted owners/managers. Permit read-only members only the preview/download behavior allowed by the workspace policy. Enforce restrictions server-side and through Supabase RLS for metadata.
- Use application-generated identifiers and validated metadata; do not trust MIME types, names, size declarations, or user-supplied folder IDs alone. Avoid server-side arbitrary URL fetching.
- Preserve original files and historical associations. Attachment removal means unlinking the authorized post association unless a separately authorized deletion policy explicitly permits original-file deletion. Do not delete an original shared by multiple posts.

## Large-file workflow

- Use Google's documented resumable upload protocol for files larger than 25 MiB. Check hosting request limits and choose a supported streaming/chunked server route; do not buffer an entire large video in memory or base64-encode it into a database row.
- Validate size/type policy, use protocol-compliant chunk sizes, report progress, and handle interrupted uploads, retries, cancellation, token expiry, and finalization. Treat resumable upload sessions as bearer secrets.
- Make metadata creation/finalization idempotent and distinguish pending, complete, and failed states. An uploaded file must not appear complete until Drive confirms it and its authorized association is saved.
- Reconcile interrupted finalization without blindly uploading duplicates or deleting existing originals. Cleanup must be narrowly scoped to confirmed temporary artifacts created by that operation.

## Preview, download, and caching

- Provide protected image/video previews, downloads, and post attachment management. Honor range requests for video when the delivery route supports them.
- Keep private responses out of public caches and PWA offline caches. Avoid leaking private thumbnails via public URLs, analytics, error reports, or referrers.
- Validate permissions again on each protected media request; possession of a post ID or UI visibility does not grant media access.

## Verification

In an isolated authorized test location, verify upload and download integrity for a file larger than 25 MiB, preview behavior, interrupted/resumed upload, duplicate submission, permission denial, attachment unlinking without original deletion, and cross-post association restrictions. Use disposable test assets only. If the folder, credentials, or safe test location is unavailable, report the integration as prepared but unverified rather than functional.
