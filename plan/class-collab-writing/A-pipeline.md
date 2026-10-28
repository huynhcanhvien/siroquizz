# Phần A — Tối ưu pipeline hiện tại

Đọc `README.md` trước. Mọi tham chiếu dòng theo `main` tại `b743899` (2026-10-29). Mỗi mục: vấn đề (đã kiểm chứng) → cách sửa → test. Trước khi sửa, đọc lại file để xác nhận dòng.

## M0 — Nền tảng (gói WP1, phải xong trước WP3/WP4)

### A1. Rate limit ghi chung 60/phút chặn nhầm
**Trạng thái:** done
- **Vấn đề:** `src/server/api.ts:113-114` áp `enforceLimit("write:<user>")` (mặc định 60/phút, `src/server/rate-limit.ts:10`) cho mọi non-GET. Upload AI tuần tự (tối đa 100 file, `api-generator.ts:216-247`) và lật thẻ nhanh (`PUT /progress` mỗi lần vuốt, `FlashcardDeck.tsx:220-231`) chạm 429; `RATE_LIMITED` không retry (`data-provider.tsx:73`) nên cả lượt tạo thất bại. Limit riêng `ai-step` 300/60 ở `src/app/api/v1/ai/[...path]/route.ts:118` không bao giờ có tác dụng.
- **Sửa:** `api(request, action, { writeLimit?: { key: string; max: number; seconds: number } | "none" })`. Hàm thuần `writePolicy(path: string[]): WritePolicy` trong `src/server/write-policy.ts`: `ai/*` → `"none"` (đã có limit riêng); `sets/:id/progress`, `reviews`, `reviews/*`, `writing/docs/:id/sync` → `{ key: "write-fast", max: 120, seconds: 60 }`; còn lại `{ key: "write", max: 60, seconds: 60 }`. Router v1 và router AI truyền policy.
- **Test:** unit `write-policy.test.ts`; integration: 61 request progress trong 1 phút không 429, 61 request tạo bộ vẫn 429 (mock `rate-limit` như `tests/integration/community-api.test.ts`).

### A2. Thiếu index cho FK cascade
**Trạng thái:** done — migration 0016_mighty_steel_serpent; xoá bộ 500 thẻ trên 100k progress+logs: 13ms (có index) vs 4400ms (không)
- **Vấn đề:** `card_progress` (PK `user_id,card_id`), `card_stars` (PK `user_id,card_id`), `review_logs` (index `user_id,reviewed_at`) không dùng được cho `card_id`; xoá thẻ/bộ (`sets.ts:124,171-174`, cron hard-delete) quét toàn bảng. `test_results(set_id)`, `study_activity(set_id)`, `card_progress(set_id)` tương tự. `cards_set_idx` (`schema.ts:167`) trùng cột đầu của unique `(set_id, position)` (`drizzle/0000_futuristic_naoko.sql:153`).
- **Sửa:** thêm index `card_progress(card_id)`, `card_progress(set_id)`, `card_stars(card_id)`, `review_logs(card_id)`, `review_logs(set_id)`, `test_results(set_id)`, `study_activity(set_id)`; bỏ `cards_set_idx`. Migration M0 (`pnpm db:generate`).
- **Test:** migration chạy trên DB test; `EXPLAIN` xoá 1 bộ 500 thẻ dùng index (ghi số liệu vào `specs/state.md`).

### A3. Thư viện/Home/Lớp tải toàn bộ thẻ của mọi bộ
**Trạng thái:** done — thêm `countProgress`, `summarizeProgress(cardCount, counts)`; Home dùng `set.progress` từ listing (không refetch theo vuốt)
- **Vấn đề:** `listSets` (`src/server/services/sets.ts:259-271`) join toàn bộ thẻ cho 50 bộ/trang; client `collectPages` (`src/lib/http-client.ts:116-139`) tới 20 trang. Màn hình chỉ cần `cards.length` (`SetCard.tsx:45`, `HomeDashboard.tsx:105`, `set-utils.ts:16`) và tiến độ theo bộ (`HomeDashboard.tsx:82-101` `summarizeProgress(set.cards, progress)`). Dùng bởi `LibraryView.tsx:65`, `HomeDashboard.tsx:127`, `ClassView.tsx:113`.
- **Sửa:** `listSets` trả `cards: []`, `cardCount` (cột có sẵn) và `progress: { known: number; learning: number }` của viewer (subquery như `assignedToMe` ở `classes.ts:291`). Thêm `cardCount: number` vào `studySetSchema` (`src/features/sets/schemas.ts:79-95`) và `StudySet` (`src/lib/types.ts`); `getSet` và local repository đặt `cardCount = cards.length`. `summarizeProgress` nhận `cardCount` thay vì `cards`. `set-utils.ts:16` sort theo `cardCount`. `useSets()` giữ key `["sets"]`.
- **Test:** integration `listSets` không trả thẻ, `cardCount`/`progress` đúng; unit `summarizeProgress`, `set-utils`; test component hiện có vẫn xanh.

### A4. Review khoá hàng `study_sets` bằng `FOR UPDATE`
**Trạng thái:** done — `SetLock` + `lockStrength` ở access.ts; `requireCard` nhận lock nên bỏ được lần kiểm tra thứ hai; `resetProgress` cũng dùng "share"
- **Vấn đề:** `learning.ts:106` và `progress.ts:41,123,156,166` gọi `requireStudySet(tx, …, true)` = `SELECT … FOR UPDATE` trên `study_sets`. 30 học sinh ôn cùng bộ chạy tuần tự và chặn `updateSet` của chủ bộ. `learning.ts:105-106` kiểm tra bộ 2 lần (`requireCard` đã gọi `requireStudySet`).
- **Sửa:** chữ ký `requireStudySet(db, userId, setId, lock: false | "update" | "share" = false)`; `"share"` → `.for("key share")`. Đường ghi tiến độ (`putProgress`, `saveTest`, `saveGame`, `recordActivity`, `reviewInTransaction`) dùng `"share"`; `updateSet`/`removeSet` (qua `requireOwnedSet`) giữ `"update"`. Bỏ dòng `learning.ts:106`. Cập nhật mọi caller `true` → `"update"`.
- **Test:** integration: 2 transaction review song song cùng bộ không chặn nhau (đo thời gian hoặc dùng `pg_locks`); `updateSet` vẫn chờ review đang chạy xong.

### A5. `putProgress` chạy tới 500 × ~8 query
**Trạng thái:** done — 500 thẻ: 4003 → ≤10 query (đo bằng drizzle logger); `putProgress` truyền `verifiedSetId` để bỏ tra cứu thẻ lần 2; lô trùng cardId/eventId → 400
- **Vấn đề:** `progress.ts:51-72` gọi `reviewInTransaction` từng thẻ; mỗi lần ~8 query (`requireCard`, `requireStudySet`, `getPreferences`, `count(*)` review_logs, upsert, insert log) → 4.000 round trip khi giữ khoá user.
- **Sửa:** `reviewBatchInTransaction(tx, userId, items: ReviewInput[], now)` trong `learning.ts`: kiểm tra mọi `cardId` thuộc bộ bằng 1 query; `newAllowance` 1 lần rồi trừ dần trong bộ nhớ (ném `NEW_CARD_LIMIT` khi hết); đọc `card_progress` của các thẻ 1 query; tính FSRS thuần; insert `card_progress` (upsert nhiều hàng) + `review_logs` (nhiều hàng) mỗi bảng 1 lần; kiểm tra `eventId` trùng bằng 1 query `inArray`. `reviewInTransaction` gọi batch với 1 phần tử (giữ chữ ký). `putProgress` gom thẻ `status !== "new"` thành 1 batch.
- **Test:** integration: 500 thẻ ≤ 10 query (đếm qua drizzle `logger` tuỳ biến trong test); snapshot FSRS giống hàm cũ cho cùng input/`now`; `NEW_CARD_LIMIT` đúng khi batch vượt hạn mức.

### A6. `updateSet`/`duplicateSet` đọc thừa; tách helper cho phần B
**Trạng thái:** done — thêm `deckOf`; `createSetInTransaction` nhận `{ copiedFromId }` để `duplicateSet` đọc bộ nguồn 1 lần; tách `listSets` (afterCursor/encodeCursor/listedSet) cho hàm < 50 dòng
- **Vấn đề:** `sets.ts:157` gán `getSet(tx)` vào `updated` không dùng rồi L161 `getSet(db)` lần nữa; `duplicateSet` (L303-313) đọc bộ 4 lần. Phần B cần dùng lại logic thay thẻ.
- **Sửa:** tách `replaceDeck(tx, setId, cards): Promise<number>` (logic L114-147 nguyên vẹn: giữ id có trong bộ, `v7()` cho id lạ, chặn id trùng, xoá thẻ thiếu, 1 upsert với `setWhere`) và `writeSetFields(tx, set, data, cardCount)` (L148-156, `where eq(studySets.id, set.id)`). `updateSet` = lock + `replaceDeck` + `writeSetFields`, `getSet` 1 lần sau tx. `duplicateSet` đọc 1 lần (`getSet` đã kiểm quyền). Tách `toCardDto({card, image})` dùng chung `getSet`/`listSets`.
- **Test:** test hiện có xanh; thêm unit cho `replaceDeck` qua integration (id lạ → id mới, vị trí liên tục).

## M2 — AI pipeline (gói WP2)

### A7. Tác vụ phụ gửi tới 500 thẻ một lần, không deadline, client timeout 15s
**Trạng thái:** done — maxTokens = min(4096, 256 + 40·n phiên âm / 90·n ví dụ) thay vì 60 + 40·n để chừa token reasoning; client lặp với `ids` = remainingIds
- **Vấn đề:** `src/server/ai/auxiliary.ts:60-124`: với `setId` gửi toàn bộ thẻ trong 1 call, `maxTokens` mặc định 4096 (`groq.ts:60`), không `deadline` → mỗi attempt 50s × 3 vượt `maxDuration = 60`; model echo UUID (~20 token/thẻ) nên >150 thẻ phiên âm hoặc >60 ví dụ bị `AI_OUTPUT_TRUNCATED`; refund trong `catch` (L142-147) không chạy khi function bị kill. Client `AiSetTools.tsx:30-33` qua `http-client` timeout 15s (`http-client.ts:75`).
- **Sửa:** chia lô 40 thẻ; id gửi model = chỉ số (`"0".."39"`), map lại UUID ở server; `maxTokens = min(4096, 60 + 40·n)`; `deadline = Date.now() + 45_000` truyền vào `groqJson`; chạy lô tuần tự, dừng khi còn < 8s, trả `{ cards, partial: boolean, remainingIds }`; quota: 1 lượt `ai_aux_usage` cho cả request. Client: `requestLong` (timeout 55s) trong `http-client.ts` cho `/ai/*`; `AiSetTools` lặp gọi với `remainingIds` tới khi `partial=false`, hiện tiến độ.
- **Test:** unit `batchCards` (200 → 5 lô); integration với mock Groq: lô 2 hỏng → trả lô 1 + `partial`; deadline hết → `partial` và không ném.

### A8. Hạn mức token toàn app đếm sai
**Trạng thái:** done — job cũ chưa có tokens_reserved dùng creditsReserved×3000; token kiểm duyệt cộng vào ai_aux_usage của chủ bộ (count không đổi)
- **Vấn đề:** `src/server/ai/credits.ts:73-88`: job đang chạy tính `creditsReserved × 3000` dù ước lượng token thật đã có khi reserve (L104-119); tác vụ phụ và kiểm duyệt không tính.
- **Sửa:** cột `ai_generation_jobs.tokens_reserved int default 0` (migration M2) ghi trong `reserveCredits`; `ai_aux_usage.tokens int default 0` cộng dồn token thật của aux/moderation (`groqJson` trả usage). `globalTokensToday` = token job xong hôm nay + `tokens_reserved` job active + `ai_aux_usage.tokens` hôm nay.
- **Test:** integration `assertGlobalCapacity` chặn đúng với 2 job đồng thời trên tài liệu lớn.

### A9. Mỗi chunk ít nhất một request
**Trạng thái:** todo
- **Vấn đề:** `src/features/ai-generate/lib/credits.ts:66-79` `Math.max(1, …)`, `output.ts:68` `CHUNK_TOKENS = 2500`, `generate.ts:14` `CONCURRENCY = 2`: 100k token + 10 thẻ = 40 call ≈ 148k token, ~18 phút throttle 8k tpm; `normalizeCards` bỏ 30+ ứng viên.
- **Sửa:** hàm thuần `planRequests(chunks, cardsRequested): Request[]` trong `src/features/ai-generate/lib/plan-requests.ts`: khi `chunks.length > cardsRequested * 2` gộp chunk kề nhau thành yêu cầu ≤ 8.000 token (vẫn đọc mọi đoạn, đúng spec "AI xử lý mọi đoạn"); phân bổ `cardsPerRequest` theo tỉ lệ token. Ước lượng credit và `generateStep` dùng cùng hàm.
- **Test:** unit `plan-requests.test.ts` (40 chunk/10 thẻ → ≤ 13 request; 3 chunk/50 thẻ → 3 request; tổng thẻ = yêu cầu); `pnpm ai:eval` không giảm chất lượng (so `evals/ai-generation/latest-report.json`).

### A10. State job lưu văn bản 2 lần, đọc/ghi toàn bộ mỗi step
**Trạng thái:** todo
- **Vấn đề:** `job-steps.ts:256-276` giữ `state.texts` sau khi có `state.chunks` (~0.5–0.6 MB jsonb cho 100k token); `jobs.ts:141-151` (`requireJob`), `273-287` (`acquireLease` `.returning()`), `155-173` (`listJobs`, chạy mỗi lần mở app qua `ResumeAiJob`) đều select cả `state`; job queued poll 3s đọc ~1.2 MB mỗi lần; job cancel/fail giữ state 24h.
- **Sửa:** xoá `texts` khi đã có `chunks`; `requireJob`/`acquireLease`/`listJobs`/`currentResult` select đúng cột (`listJobs` không trả `state`); `state = null` khi `failed`/`cancelled`.
- **Test:** integration: sau `extractStep` không còn `texts`; `listJobs` payload không có `state`.

### A11. PDF tải lại và parse lại mỗi 6 trang; inspect không deadline, giữ mọi upload trong RAM
**Trạng thái:** todo
- **Vấn đề:** `job-steps.ts:51` `PDF_PAGE_BATCH = 6`, `187-193` cache tải chỉ sống 1 step, `202-227`; `extract.ts:272-311` `inspectPdf` duyệt mọi trang không kiểm deadline; `inspectUploads` (`job-steps.ts:143-151`) giữ toàn bộ upload (tới 200 MB) trong bộ nhớ; `estimateTokens` chạy lại trên toàn bộ text mỗi lô (`job-steps.ts:212,237`, `extract.ts:264`, `browser-ocr.ts`) → bậc hai.
- **Sửa:** trang có text layer đọc hết trong 1 step (chỉ trang scan chia lô OCR); inspect từng upload, lưu `state.inspectCursor`; kiểm `ctx.deadline` trong vòng lặp trang; giữ `state.runningTokens` cộng dồn thay vì ước lượng lại.
- **Test:** integration với PDF 60 trang text (fixture `tests/`): 1 step extract; deadline giả 1ms → step trả `retryAfterMs` và cursor tiến.

### A12. Prompt không tận dụng prefix cache
**Trạng thái:** todo
- **Vấn đề:** `generate.ts:57-67` đặt ~350 token instructions tĩnh **sau** `document` thay đổi mỗi call; chỉ system prompt ngắn (`groq.ts:114-124`) là prefix chung.
- **Sửa:** chuyển instructions + settings vào system message (hoặc trước `document`), chunk đặt cuối.
- **Test:** `pnpm ai:eval` ghi `cached_tokens` trước/sau vào `specs/state.md`.

### A13. Cron kiểm duyệt vỡ khi một call timeout; lease và retry
**Trạng thái:** todo
- **Vấn đề:** `moderation.ts:92-111` dùng `AbortSignal.timeout(20_000)`; `groqJson` ném `DOMException` thô (`groq.ts:168`) không phải `ApiError` → vòng `moderatePending` (L175) vỡ, cron trả 500; 20 bộ × 20s vượt 60s. `groqJson` retry lỗi mạng không backoff (`groq.ts:167-171`). Lease 65s (`jobs.ts:72`) khi function bị kill khiến client poll "busy" ~30 lần.
- **Sửa:** timeout/abort → giữ `pending`; try/catch từng bộ; dừng khi còn < 10s ngân sách step; backoff `300ms × 2^n` (tối đa 3); `LEASE_MS = 50_000`.
- **Test:** integration mock Groq timeout ở bộ 1 → bộ 2 vẫn được duyệt, route cron 200.

## M4 — Build/CI/dọn dẹp (gói WP5)

### A14. Ảnh thẻ mồ côi không bao giờ xoá
**Trạng thái:** todo
- `card-images.ts:56` set `cardId = null` khi thay ảnh; `schema.ts:597` `onDelete: "set null"`; `ai/cleanup.ts` chỉ dọn `ai_uploads`. → Cron xoá `card_images` có `card_id null` và `created_at < now - 24h` kèm object S3 (`DeleteObjects` lô 1000). Test integration với adapter S3 giả.

### A15. Cleanup upload từng cái một
**Trạng thái:** todo
- `ai/cleanup.ts:7-11`: 1 call S3 + 1 delete mỗi upload, tối đa 500/ngày trong cron 60s, backlog có thể vượt. → `DeleteObjects` theo lô + `DELETE … WHERE id = ANY(...)`.

### A16. Rate limit đăng nhập chỉ trong bộ nhớ từng instance
**Trạng thái:** todo
- `auth.ts:91-100` đặt rule tuỳ chỉnh không `storage` → Better Auth dùng memory, tách theo instance Vercel. → `rateLimit.storage: "secondary-storage"` với Upstash khi có env, fallback `"database"`. Kiểm tra bằng docs Better Auth 1.7.

### A17. CI lặp mọi việc ở 3 shard và build 3 lần
**Trạng thái:** todo
- `.github/workflows/ci.yml`: matrix 3 shard đều install/lint/typecheck/unit/migrate/integration/playwright install, và mỗi shard `next build` qua `webServer` (`playwright.config.ts:28`); không cache `.next/cache`, Playwright browsers. → job `quality` (1 lần) + job `build` upload artifact `.next` (+ `public/vendor`) + job `e2e` matrix 3 tải artifact, `E2E_PREBUILT=1` → `webServer.command = pnpm start --port 3100`; cache `~/.cache/ms-playwright` và `.next/cache` (`actions/cache`).

### A18. `--webpack` cố định vì lỗi Turbopack trên một máy
**Trạng thái:** todo
- `package.json` `dev`/`build` dùng `--webpack` do Turbopack panic PostCSS worker "trên máy này" (`specs/state.md`). → `build`/`dev` mặc định không flag; thêm `dev:webpack`/`build:webpack`; thử Turbopack ở Vercel preview; nếu lỗi thì `vercel.json` `buildCommand: "pnpm build:webpack"`. Không chặn merge; ghi kết quả vào `specs/state.md`.

### A19. Ôn tập tải lại hàng đợi sau mỗi lần chấm
**Trạng thái:** todo
- `ReviewQueue.tsx:108` giữ `useDue` mounted khi `ActiveReview` làm việc trên snapshot; `srs/hooks.ts:63-68` invalidate `["due"]`, `["stats"]`, `["progress"]` mỗi lần chấm → chạy lại `dueCards` (`learning.ts:206-237`) mỗi thẻ. `progress/hooks.ts:50` invalidate mỗi lần vuốt. → tắt query `due` khi phiên đang chạy (`enabled: !active`), invalidate 1 lần khi kết thúc phiên; vuốt chỉ cập nhật cache cục bộ.

## Đã kiểm tra và thấy ổn (không sửa)
React Query defaults (staleTime 30s, không refetch focus); thư viện nặng (`qrcode`, pdf.js, ONNX, `pinyin-pro`) đã ngoài bundle chính; session đọc từ cookie cache; `getQuota` chạy 2 query song song; TypeScript strict; coverage threshold có sẵn. Lưu ý pool `max: 1` nên `Promise.all` query thực chất tuần tự.
