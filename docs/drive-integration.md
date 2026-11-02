# Google Drive media integration

The implementation is **prepared and disabled by default**. No live Google Drive requests, uploads, sharing changes, or database migrations were performed. Existing Supabase Storage originals and metadata remain intact.

## Implemented development behavior

`components/workspace-media.tsx` accepts `data`, `mode`, optional `onAttach(postId, media)`, `busy`, and optional `getAccessToken()` props. Demo mode supports image/video selection, previews, downloads, post attachment/unlink, filename search, and browser-copy removal. It uses object URLs rather than base64/localStorage, accepts originals larger than 25 MiB, and clearly identifies files as session-local. The shared demo URL registry preserves attachments through tab changes and clears expired blob references after a browser reload. Unlinking preserves original files.

Production mode uses the authenticated server endpoints below. The current user's token is sent in an Authorization header, never in URLs. No backend access is granted by demo role switching. Read-only members cannot upload, attach, unlink, or remove media. Existing post attachments remain viewable when Drive is disabled.

## Server routes

| Route | Behavior |
| --- | --- |
| `GET /api/drive/` | Lists completed metadata and post associations for the verified workspace. |
| `POST /api/drive/uploads/` | Validates metadata, starts a resumable upload into the configured HQ folder, creates a pending record, and returns an encrypted upload ticket. |
| `PUT /api/drive/uploads/:id/` | Sends a bounded chunk or queries the committed offset; verifies the completed original before marking metadata complete. |
| `GET /api/drive/files/:id/` | Authorizes the metadata record and current Drive parent folder, then streams private content with range support. `?download=1` requests attachment disposition. |
| `POST /api/drive/associations/` | Associates a verified completed original with a permitted post. |
| `DELETE /api/drive/associations/` | Unlinks the association only. No Drive delete operation exists. |

All routes return `private, no-store`. They require `HQ_DRIVE_ENABLED=true`; otherwise they return a clear 503 without contacting external services. Callers are validated through Supabase `getUser`, confirmed email, and current database membership. Writes allow owners/managers/legacy collaborators, with existing owner-only restrictions for approved/published content. The API never accepts an arbitrary folder or download URL from the caller.

Drive metadata is read-only to authenticated database clients. Only the server writes it after checking the caller, preventing direct PostgREST writes from replacing a trusted Drive file ID with an unrelated private file. Downloads additionally verify the configured folder and trashed state with Google. The service key cannot delete Drive asset metadata; association deletion preserves originals.

Uploads use 8 MiB chunks (256 KiB aligned except the last chunk) with a 5 GiB application limit. Server memory is bounded to one chunk. The provider session URL is encrypted using AES-256-GCM and bound to the upload ID, user, workspace, total size, and a 24-hour expiry. It is never returned in plaintext. Resume checks Google's committed offset. Completion validates parent folder, byte size, and MIME type. Retrying an already completed upload returns its existing result.

## Configuration required before live verification

Review and apply the additive migrations to an authorized development database first. The new Drive tables are in `20261102180000_drive_metadata.sql`; the historical migration is unchanged.

Configure these server-only values securely in environment settings:

- `HQ_DRIVE_ENABLED=true` only after the integration is authorized and ready.
- `HQ_GOOGLE_CLIENT_ID`, `HQ_GOOGLE_CLIENT_SECRET`, `HQ_GOOGLE_REFRESH_TOKEN`: a dedicated Google OAuth binding authorized for the intended folder. Ambient machine Google credentials are deliberately not used.
- `HQ_UPLOAD_ENCRYPTION_KEY`: a cryptographically random 32-byte secret, base64 encoded. Do not reuse provider credentials as this key.
- `HQ_SUPABASE_SERVICE_ROLE_KEY`: the dedicated server credential matching the configured development Supabase project. Never use `NEXT_PUBLIC_` for it.
- Matching `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` when using an isolated project instead of the preserved existing project reference.

Required network destinations are the configured Supabase project, `oauth2.googleapis.com`, and `www.googleapis.com`. Confirm Google scopes, ownership/quota, Shared Drive versus My Drive behavior, and the existing folder access model before granting access. The fixed intended folder is `1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn`; development verification should use an explicitly authorized disposable location or a reviewed configuration adaptation. No public sharing permission is created.

## Verification and limitations

- Thirteen offline protocol/server tests exercise default-disabled mode, unauthenticated/read-only denial, metadata validation, chunk alignment, encrypted ticket tampering/scope/expiry, Drive folder escape, 32 MiB chunked completion and idempotency, interrupted-upload recovery, cross-workspace denial, private ranged downloads, unlink preservation, approved-post restrictions, and error redaction.
- Fourteen isolated PostgreSQL assertions verify tenant reads, verified identities, anonymous denial, prevention of client metadata forgery, restricted server grants, and metadata consistency. These run with the existing PGlite harness and roll back fixtures.
- No live OAuth round trip, provider credential exchange, private Drive access, or real 32 MiB Google upload has been verified. Offline provider responses are injected mocks.
- The browser preview/download currently fetches a private original into a Blob on demand; large-video memory behavior must be profiled on a physical iPhone. The server download route supports streaming and ranges, but authenticated browser video playback uses a fetched Blob rather than range requests directly.
- Upload pause/resume state lasts while the media screen remains mounted. Reloading or leaving the screen requires starting again. Provider sessions expire naturally; abandoned pending metadata is retained for reviewed cleanup, never deleted automatically.
- Drive associations are persisted separately from historical single-media Supabase fields. The library and post-details panel expose these associations through authenticated, same-origin, no-store requests. Calendar cards still use historical primary-media thumbnails; a separate optimized private thumbnail pipeline is outstanding. Five client tests verify demo isolation, no unauthenticated fetch, association filtering, bearer-header use, and error handling.
- Session-local demo media expires on reload and is not a substitute for verified Drive storage.
