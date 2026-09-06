# Tasks — Media Pipeline (MEDIA)

Context: No upload infrastructure exists. We add a `StorageService` abstraction (local-disk
driver now, S3-compatible later), a `MediaAsset` entity, direct browser→API multipart uploads
(decision D3), sharp image variants, and client-captured video posters (decision D10 — no ffmpeg
on the distroless API). Limits (PLAT-003): image ≤ 10 MB × 15/lot, video ≤ 50 MB × 60 s × 3/lot.

---

### MEDIA-001 ✅ — StorageService abstraction + MediaAsset + serving

**P0 · Phase 3 · Media · M** — Deps: PLAT-003

- **Goal:** `modules/media` with `StorageService` interface + local-disk driver, `MediaAsset` model, public/secure serving endpoints.
- **Why:** Foundation for lot images, videos, avatars, chat attachments; driver abstraction avoids a later migration.
- **User story:** n/a (foundation).
- **Files:** `apps/api/src/modules/media/` (module, `storage/storage.service.ts` interface, `storage/local-disk.driver.ts`, controller, service, repo, dto), `prisma/schema.prisma` + migration, `apps/api/.env.example`, `apps/web/next.config.ts` (CSP gains the media origin).
- **Backend:** interface: `put(key, buffer, contentType)`, `get(key): Readable`, `delete(key)`, `exists(key)`; local driver writes under `STORAGE_DIR` (git-ignored, volume-mounted in deploy), keys `{yyyy}/{mm}/{cuid}.{ext}` (unguessable). `MediaAsset` per plan §3. Serving: `GET /media/:key` — public route, immutable cache headers, streams from driver, only keys matching public pattern (lot variants/avatars); `GET /media/secure/:key` — bearer-authenticated (chat media), same streaming.
- **Frontend:** none (one web change: CSP `img-src`/`media-src` in `next.config.ts` gains the media origin — `PUBLIC_MEDIA_BASE_URL`).
- **Database:** MediaAsset migration + indexes.
- **API:** swagger minimal (binary responses documented); `gen:types` for DTOs if any.
- **Validation:** key path-traversal guard (`..` rejected); content-type from stored asset, not request.
- **Error states:** 404 unknown key; 401 secure w/o token.
- **Permissions:** public route public; secure authenticated.
- **Acceptance:** put/get/delete round-trip e2e; traversal attempt 400; secure route rejects anonymous.
- **Testing:** driver unit tests (tmp dir), controller e2e (streams, headers, auth).
- **DoD:** `STORAGE_DIR` in .gitignore + docker-compose volume for api service; suites green.

### MEDIA-002 ✅ — Image upload API (variants via sharp)

**P0 · Phase 3 · Media · M** — Deps: MEDIA-001 (adds `sharp` dep — intentional package-lock change)

- **Goal:** `POST /media` multipart image upload → MediaAsset with original + cover (1200w) + thumb (480w) WebP variants.
- **Why:** Lot galleries, avatars, chat images need optimized variants for cards/detail/mobile.
- **User story:** As a seller my 8 MB phone photo becomes a fast-loading listing image.
- **Files:** `apps/api/src/modules/media/media.controller.ts` (FileInterceptor + multer memory storage), `media.service.ts`, `images/variant.service.ts`.
- **Backend:** accept single file `file`; magic-byte sniff (jpg/png/webp — reject on mismatch w/ declared mime); size cap; generate variants with sharp (WebP q80 + JPEG fallback for cover); store all keys; create MediaAsset row (width/height from metadata); per-user daily quota (e.g. 200 uploads/day) counted from MediaAsset; return dto {id, urls:{original, cover, thumb}, width, height}.
- **Frontend:** none.
- **Database:** none.
- **API:** `@ApiBearerAuth` + `@Throttle` (e.g. 30/min); consumes multipart; swagger + `gen:types`.
- **Validation:** type/size/quota as above; filenames never used for storage keys.
- **Error states:** 415 bad type, 413 too large, 429 quota/throttle, 500 variant failure (cleanup partial keys).
- **Permissions:** any authenticated user.
- **Acceptance:** upload returns 3 URLs that stream correctly; quota enforced; forged extension rejected.
- **Testing:** e2e multipart (happy, oversize, wrong-mime, quota); variant service unit.
- **DoD:** sharp in api deps; suites green.

### MEDIA-003 ✅ — Video upload API (client poster, limits)

**P0 · Phase 3 · Media · M** — Deps: MEDIA-002

- **Goal:** `POST /media/video` accepting video + client-captured poster image; validates duration/size; stores poster thumb.
- **Why:** Feature #10: lot videos up to 60 s × 3 — without server ffmpeg (D10).
- **Files:** `apps/api/src/modules/media/media.controller.ts`, `video.service.ts`.
- **Backend:** multipart fields `video` + optional `poster` (image, goes through variant pipeline as thumb); accept mp4/webm (magic-byte sniff: ftyp/mp4, webm); size ≤ MAX_VIDEO_MB; duration: client reports `durationMs` **and** server does a lightweight mp4 `mvhd` box parse for mp4 (pure-TS parser, ~50 lines) — webm trusts client flag when parse unavailable (documented residual risk); MediaAsset type VIDEO with durationMs; quota shares MEDIA-002 bucket (count videos double).
- **Frontend:** none (MEDIA-004 supplies poster).
- **Database:** none.
- **API:** same auth/throttle; swagger + `gen:types`.
- **Validation:** duration ≤ 60s (+1s tolerance); poster must be image.
- **Error states:** as MEDIA-002 + 422 duration exceeded.
- **Permissions:** authenticated.
- **Acceptance:** 61 s mp4 rejected server-side; poster missing → fallback generic video icon URL.
- **Testing:** e2e with fixture files (valid/oversize/overduration); mvhd parser unit tests.
- **DoD:** fixtures committed under `apps/api/test/fixtures/`; suites green.
- **Notes (implementation):** binary fixtures replaced by hand-built mp4/WebM buffers generated
  in the specs (same no-committed-binaries decision as MEDIA-002's suites). Poster keys derive
  from the video key — `{id}p.{ext}` original, `{id}pt.webp` thumb (row `thumbKey`); the poster
  adds no MediaAsset row and each video counts double toward the shared daily quota.

### MEDIA-004 ✅ — Web uploader components

**P0 · Phase 3 · Media · L** — Deps: MEDIA-002, MEDIA-003, PLAT-001

- **Goal:** Shared `MediaUploader` (multi-image + video) with camera capture, gallery pick, client compression, progress, retry, reorder, cover select, delete — reused by lot wizard, chat, avatar.
- **Why:** Features #9/#10/#18 UX; one component, three consumers.
- **Files:** `apps/web/src/features/media/` (gen:feature): `components/media-uploader.tsx`, `components/media-grid.tsx`, `components/video-recorder-modal.tsx`, `hooks/use-upload.ts`, `lib/compress.ts`, `lib/poster-capture.ts`.
- **Backend:** none.
- **Frontend:** `<input capture="environment">` for camera; canvas downscale to ≤ 2000px/q0.8 before upload; poster capture via `<video>` seek + canvas; XHR upload (progress events — reason fetch is insufficient); failed items show retry; drag/tap reorder (mobile: tap-to-swap positions via edit mode); cover badge tap; per-context limits props (imagesMax/videosMax); Persian status copy.
- **Database:** none.
- **API:** consumes MEDIA-002/003 endpoints directly (absolute API URL from `lib/config` — uploads bypass BFF per D3).
- **Validation:** client pre-checks limits; server remains source of truth.
- **Error states:** per-file error tiles w/ retry/remove; offline queue not in scope.
- **Permissions:** authenticated.
- **Acceptance:** on 360px + slow-3g throttle: camera capture → compressed upload → grid reorder/cover all work; retry on simulated 500.
- **Testing:** component tests with mocked XHR; compress/poster unit tests.
- **DoD:** exported via feature barrel; used by LOT-004/CHT-007/PROF-004.

### MEDIA-005 — Lot media attach/organize API

**P0 · Phase 3 · Media · S** — Deps: MEDIA-002, LOT-001

- **Goal:** `LotMedia` model + `PUT /lots/:id/media` (set ordered list w/ cover flag) enforcing per-lot caps.
- **Why:** Lots display galleries; caps and order are data, not client state.
- **Files:** `apps/api/prisma/schema.prisma` + migration, `src/modules/lots/lots.service.ts` (attachMedia), controller route, `dto/lot-media.dto.ts`.
- **Backend:** validate: every MediaAsset owned by caller; counts ≤ 15 images / ≤ 3 videos; exactly one cover (default first image); transactional replace (delete removed links); orphan cleanup deferred to P1 job.
- **Frontend:** none (LOT-004 calls it).
- **Database:** migration + unique(lotId, mediaAssetId), index (lotId, sortOrder).
- **API:** owner-only; swagger + `gen:types`.
- **Validation:** as above.
- **Error states:** 409 caps exceeded (fa message w/ counts); 403 foreign asset.
- **Permissions:** lot owner.
- **Acceptance:** set → reorder → cover change reflected in lot public payload (`media[]` ordered, `coverMediaId`).
- **Testing:** service unit (caps, ownership, cover default), e2e.
- **DoD:** suites green.

### MEDIA-006 — S3-compatible storage driver

**P1 · Phase 9 · Media · M** — Deps: MEDIA-001 (runtime: when media volume/egress cost justifies)

- **Goal:** `S3Driver` implementing StorageService against S3-compatible object storage (AranCloud/Liara), `STORAGE_DRIVER` env switch, migration script for existing keys.
- **Why:** Offload egress/backups; CDN-ready URLs — without touching call sites.
- **Files:** `apps/api/src/modules/media/storage/s3.driver.ts`, `storage/storage.module.ts` (driver selection), `scripts/migrate-storage.ts` (one-off), `.env.example`.
- **Backend:** presigned-GET or public-base-URL mode for serving (config); upload via SDK stream; keep local driver default.
- **Frontend:** none.
- **Database:** none (keys unchanged).
- **API:** none.
- **Validation:** driver boot check (credentials, bucket reachable) fail-fast.
- **Error states:** serving falls back to driver error → 502 logged.
- **Permissions:** system.
- **Acceptance:** env flip moves reads/writes with zero code changes elsewhere; migration script verified on staging copy.
- **Testing:** driver unit tests against mocked SDK; integration test skippable without creds (CI-safe).
- **DoD:** runbook section in `doc/tech/` for cutover.
