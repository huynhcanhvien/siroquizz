# Trạng thái dự án & nhật ký bàn giao

> File này ghi lại **đã làm gì, đang làm dở gì, làm tiếp thế nào** để bất kỳ ai (người hoặc agent) cũng có thể tiếp tục.
> Thời gian theo giờ Việt Nam (UTC+7). Mục mới nhất ở trên cùng của phần Nhật ký.

**Cập nhật lần cuối:** 2026-10-04 22:30 +07
**Phase hiện tại:** Phase 2–3 hoàn tất local (Groq live pass). Đã thêm hạ tầng **deploy Vercel free + chia nhỏ job AI (resumable step)**, đang chờ nghiệm thu production. Phase 4 (SRS) vẫn đang dở. Google OAuth/R2/Resend production còn chờ credentials.
**Tình trạng:** Người dùng yêu cầu hoàn thành toàn bộ Phase 2–6 và cập nhật state khi từng phase xong. Không coi credentials, deployment hay beta bên ngoài đã hoàn tất nếu chưa thực hiện.

## Tóm tắt nhanh cho người tiếp quản

- `.env.local` đang chạy HTTP với DB5433, Better Auth thật, SMTP Mailpit; khóa `GROQ_LLM_API` được giữ riêng, template không chứa secret.
- `pnpm services:up` → `pnpm db:migrate` → `pnpm dev`; thư xác minh/reset ở http://localhost:8025. `pnpm build` và dev dùng webpack vì Turbopack panic PostCSS worker trên máy này.
- Dependencies dùng `pnpm --store-dir .pnpm-store add ...` trong phiên này. Store workspace đã ignore.
- Test: lint/typecheck/unit coverage; integration dùng riêng DB `_test`; E2E `PW_CHANNEL=chrome pnpm e2e` tự build/chạy3100. Server thử3000 đã dừng.
- Kết quả Phase 2: **341 unit, 18 integration, 26 E2E pass**; unit lines96.51%, integration lines94.23%; full responsive/axe checks pass trong HTTP mode.
- Kiến trúc component→hook→repository; `DataProvider` chọn HTTP/local; server services kiểm tra owner và Zod.
- Google wiring đã có, nút ẩn nếu chưa cấu hình. Chưa có Google/Resend/R2/Upstash/Vercel/Sentry live credentials. CI cấu hình nhưng workspace không có `.git` để chạy GitHub.
- AI HTTP đã dùng Groq thật: GPT-OSS120b/20b, Qwen3.8 OCR; upload signed local/S3 adapter, jobs/SSE/cancel/quota/history và tác vụ phụ. Local data-source vẫn giữ mock. 21-case eval pass, actual report ở `evals/ai-generation/latest-report.json`.

## Việc còn dở (làm tiếp từ đây)

Review code (agent code-reviewer, 2026-10-04 ~14:10) không thấy lỗi CRITICAL, có 5 lỗi HIGH và 10 nhóm MEDIUM. Trạng thái xử lý:

| #   | Mức  | Vấn đề                                                                                                                                                                                                                 | Trạng thái                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH | Open redirect qua `?next=` có ký tự tab/xuống dòng (`src/lib/safe-redirect.ts`)                                                                                                                                        | ✅ Đã sửa và có test                                                                                                                                                                                                                                                                                                                                                    |
| 2   | HIGH | Tên file `x.constructor` / `x.__proto__` lọt qua bộ lọc (`file-validation.ts`)                                                                                                                                         | ✅ Đã sửa (dùng `Map`) và có test                                                                                                                                                                                                                                                                                                                                       |
| 3   | HIGH | "Làm lại câu sai" sinh câu hỏi thiếu đáp án nhiễu                                                                                                                                                                      | ✅ `generateTest(..., pool)` và có test                                                                                                                                                                                                                                                                                                                                 |
| 4   | HIGH | Nút "Đảo thuật ngữ ↔ định nghĩa" không đảo ngôn ngữ                                                                                                                                                                    | ✅ Đảo cả `termLang`/`definitionLang`, xóa phiên âm cũ                                                                                                                                                                                                                                                                                                                  |
| 5   | HIGH | Ô tìm kiếm thư viện gắn với URL bất đồng bộ (mất ký tự, hỏng bộ gõ Telex/Pinyin)                                                                                                                                       | ✅ Dùng state cục bộ + `history.replaceState`. Ẩn ô tìm kiếm ở header khi đang ở `/library`                                                                                                                                                                                                                                                                             |
| 6   | MED  | Phím Space trên nút bị Flashcards bắt mất, giữ phím thì chạy liên tục                                                                                                                                                  | ✅ Bỏ qua khi focus đang ở nút/link, bỏ qua `event.repeat`                                                                                                                                                                                                                                                                                                              |
| 7   | MED  | "Tôi đã đúng" không được lưu vào kết quả                                                                                                                                                                               | ✅ Thêm `updateTestResultScore` và test                                                                                                                                                                                                                                                                                                                                 |
| 8   | MED  | `parseImportText` chạy O(n²)                                                                                                                                                                                           | ✅ Đổi sang tuyến tính, có test 60k dòng                                                                                                                                                                                                                                                                                                                                |
| 9   | MED  | Phím Tab bị "kẹt" trong trình soạn                                                                                                                                                                                     | ✅ Chỉ thêm dòng khi dòng cuối có nội dung. Thêm Ctrl/⌘+Enter để lưu                                                                                                                                                                                                                                                                                                    |
| 10  | MED  | Chuẩn hóa đáp án làm "C++" bằng "C"                                                                                                                                                                                    | ✅ Chỉ bỏ dấu câu ở hai đầu, có test                                                                                                                                                                                                                                                                                                                                    |
| 11  | MED  | Lỗi ghi dữ liệu bị nuốt im lặng (game, flashcards)                                                                                                                                                                     | ✅ Hiện toast lỗi                                                                                                                                                                                                                                                                                                                                                       |
| 12  | MED  | Đọc storage bỏ bản ghi hỏng, lần ghi sau làm mất hẳn                                                                                                                                                                   | ➡️ Chuyển sang Phase 2 (DB thay localStorage), đã ghi trong spec Phase 2                                                                                                                                                                                                                                                                                                |
| 13  | MED  | Focus / live region                                                                                                                                                                                                    | ✅ TestMode chuyển focus khi đổi màn hình. Match/Memory/Scramble giữ focus. Gravity có vùng thông báo. Ghép nối dùng `aria-disabled`                                                                                                                                                                                                                                    |
| 14  | MED  | Rò rỉ sang Phase 2                                                                                                                                                                                                     | ✅ `updateProfile` validate bằng zod. `UNAUTHENTICATED` xử lý toàn cục qua QueryCache/MutationCache. Đồng bộ giữa các tab qua sự kiện `storage`. Seed bộ mẫu kiểu best-effort. Mutation login/register dùng `gcTime: 0`. Spec ghi rõ UUID v4 ở Phase 1, v7 từ Phase 2. ⏳ Chưa làm: kiểm tra quyền sở hữu bộ thẻ trong progress repository (để server Phase 2 đảm nhận) |
| 15  | MED  | Thiếu test component `.tsx`                                                                                                                                                                                            | ✅ Có test cho AuthForms, SetEditor, FlashcardDeck, MatchingView (`src/test/render.tsx` là helper render). Thêm E2E cho tìm kiếm thư viện, làm lại câu sai, Gravity, Memory                                                                                                                                                                                             |
| LOW | —    | Đăng xuất dính `?next=`, guard mất query string, xóa bộ thẻ nháy "không tìm thấy", AI không hủy khi rời trang, `wait()` rò listener, bấm đúp Lưu/Tạo, đồng hồ lệch, kỷ lục điểm 0, Scramble `useMemo`, ô số câu hiện 0 | ✅ Đã sửa hết                                                                                                                                                                                                                                                                                                                                                           |
| LOW | —    | Hàm > 50 dòng                                                                                                                                                                                                          | ✅ Đã tách `SetEditor`, `FlashcardDeck`, `TestMode` (+ `use-test-session.ts`), `GravityBoard`, `AiGenerator` (+ `use-ai-generation.ts`)                                                                                                                                                                                                                                 |

**Bước tiếp theo:** Phase 4: learn-engine7cards/round, FSRS, due queue/new limits/preferences, stars, study sessions/stats/goals/streak/reminders/images. `ts-fsrs@5.4.2` đã cài, @types/node lên22 cho Vitest. Dataviz skill không có trong catalog/filesystem; dùng chart accessible theo design tokens và bảng thay thế. Sau P4 tiếp tục P5–6.

## Nhật ký

### 2026-10-04 22:30 +07: 📊 Thiết kế lại trang Thống kê + đo thời gian học thực (nhánh `perf/optimize-load`)

- **Số liệu vốn theo từng user** (mọi query lọc `userId`); thêm `tests/integration/stats.test.ts` chứng minh user A không thấy dữ liệu user B.
- **Bug "1446 phút/tuần":** thời gian = `ended_at − started_at` (tối đa 12h/phiên) nên tab để mở qua đêm tính 12h. Giờ client đo **thời gian tương tác** ([engagement-timer.ts](../src/features/srs/engagement-timer.ts): khoảng giữa hai thao tác tối đa 60s, không tính khi tab ẩn) và gửi `activeSeconds` dồn mỗi lần ẩn tab/rời trang; server chỉ tăng, kẹp theo thời gian đã trôi. Cột mới `study_sessions.active_seconds` (**migration `drizzle/0005_awesome_calypso.sql`**, chỉ thêm cột nullable); phiên cũ không có cột này tính tối đa 10 phút.
- **Giao diện mới** ([components/](../src/features/stats/components/)): bento streak (số lớn) + vòng mục tiêu + thời gian tuần (so tuần trước, sparkline 12 tuần) + thẻ đã thuộc; heatmap 12 tháng có nhãn tháng/thứ, 4 bậc màu một hue đã chạy validator dataviz (sáng/tối), viền vàng ngày đạt mục tiêu; cột 7 ngày và 12 tuần (≤24px, tooltip, focus bàn phím); biểu đồ vùng thẻ đã thuộc (crosshair, phím mũi tên); độ chính xác theo bộ thẻ. Có bảng dữ liệu cho trình đọc màn hình, trạng thái rỗng, nhãn rút gọn trên điện thoại. Token `--heat-1..4` trong `globals.css`.
- **Cảnh báo vận hành:** `drizzle.config.ts` dùng `loadEnvConfig` chế độ production → trên máy có `.env.production.local` thì `pnpm db:migrate` chạy vào **DB production**. Migrate DB local phải truyền `DATABASE_URL` local tường minh. **Production/Preview cần chạy migration 0005 trước khi deploy commit này**, nếu không trang thống kê và việc lưu phiên sẽ lỗi.
- **Kiểm tra:** 395 unit, 56 integration, E2E 30 pass (quality spec giờ quét axe + overflow cả `/stats`, `/review`); ảnh chụp desktop sáng/tối + 375px đã xem bằng dữ liệu mẫu 7 tháng trên DB local.

### 2026-10-04 21:45 +07: ⚡ Kiểm tra đáp án tức thì + sửa trang Ôn tập/Thống kê (nhánh `perf/optimize-load`)

- **Chậm khi "Kiểm tra đáp án" (Học) và chấm thẻ (Ôn tập):** chấm điểm vốn chạy local nhưng UI `await` `POST /reviews` (transaction ~11 query) mới hiện kết quả. Giờ hiện kết quả/thẻ tiếp ngay, lưu nền qua hook dùng chung [use-background-save.ts](../src/features/srs/use-background-save.ts): hàng đợi tuần tự (giữ thứ tự cho FSRS), tự thử lại lỗi NETWORK/UNKNOWN (an toàn nhờ `eventId` idempotent), lỗi hẳn thì toast. Chặn bấm đúp.
- **Bug có từ trước, phát hiện khi viết E2E:** (1) `/review` luôn báo "Đã có lỗi" vì API due trả `imageAlt/imageId/reps: null` từ LEFT JOIN, schema client không nhận null → server giờ trả đúng các field đã khai báo. (2) `/stats/overview` lỗi 500: biểu thức `timezone($n, …)` trong GROUP BY bị bind thành tham số khác → group theo vị trí cột (`BY_FIRST_COLUMN`).
- **Test mới:** `LearnMode.test.tsx` (3), `use-background-save.test.tsx`, integration "review queue & stats cho tài khoản mới" (kiểm tra đúng contract `dueResponseSchema`), E2E `learning.spec.ts` (giả lập lưu chậm 3s, kết quả vẫn hiện <1s).
- **Kết quả:** 384 unit, 51 integration, E2E 31 pass (1 live opt-in skip).

### 2026-10-04 21:10 +07: 🔧 Nhánh `perf/optimize-load`: tối ưu tốc độ + sửa AI trên Vercel (chưa merge production)

- **Tốc độ (nguyên nhân chính):** function mặc định chạy `iad1` (Mỹ) trong khi Neon ở Singapore → `vercel.json` thêm `regions: ["sin1"]`. Better Auth bật `cookieCache` 5 phút ([auth.ts](../src/server/auth.ts)); `getSessionContext` ([api.ts](../src/server/api.ts)) đọc user từ cookie ký thay vì 3 query DB/request, forward `Set-Cookie` refresh về trình duyệt, `refreshSession()` sau khi seed/đổi profile/xóa tài khoản. Thêm field `samplesSeeded` vào session → `GET /me` không còn mở transaction `FOR UPDATE` mỗi lần.
- **Bỏ waterfall:** layout server truyền user xuống `AuthGuard` (`initialUser`) → không còn loader toàn màn + gọi lại `/me`; seed bộ mẫu ngay trên server; `requirePageSession` dùng `cache()`. Thêm `loading.tsx`/`error.tsx` cho `(app)` và `(study)` (Next 16 dùng prop `retry`).
- **Query:** `updateSet` 1 câu upsert thay vì UPDATE từng thẻ; `statsOverview`/`activityStats`/`dueCards` chạy song song (`Promise.all`); `getPreferences` đọc trước, chỉ insert khi chưa có. Ảnh thẻ `Cache-Control: private, max-age=1y, immutable` (id mới mỗi lần upload). 4 game tách chunk bằng `next/dynamic`.
- **AI hỏng trên production — đã sửa 3 lỗi code:** (1) presigned PUT của AWS SDK mới tự gắn `x-amz-checksum-crc32` của body rỗng → Supabase/R2 từ chối mọi upload; S3Client đặt `requestChecksumCalculation/responseChecksumValidation: "WHEN_REQUIRED"` + test `ai-storage-s3.test.ts`. (2) `pdf.worker.mjs` không được file-trace vào function → PDF lỗi "fake worker" trên Vercel; `openPdf()` import tĩnh worker và đăng ký `globalThis.pdfjsWorker` (đã xác nhận có trong `.nft.json`). (3) Preview URL bị 403 vì `checkOrigin`/`trustedOrigins` chỉ nhận `BETTER_AUTH_URL`; giờ nhận thêm `VERCEL_URL`/`VERCEL_BRANCH_URL` khi `VERCEL_ENV=preview`, link email trỏ về branch URL.
- **Hỗ trợ đủ định dạng FE quảng cáo:** TXT/MD/CSV giải mã UTF-8 BOM, UTF-16 LE/BE (Notepad/Excel "Unicode"), fallback Windows-1258 (Excel CSV tiếng Việt), vẫn chặn dữ liệu nhị phân; ảnh xoay theo EXIF trước OCR. Upload lên storage lỗi → báo `STORAGE_UNAVAILABLE` thay vì "file không hợp lệ".
- **Cấu hình cần user kiểm tra trên Vercel:** template `.env.production.local` có `GROQ_LLM_API` rỗng → nếu Vercel cũng rỗng, AI luôn trả `AI_UNAVAILABLE`. Các biến phải tick cả scope **Preview** (nên dùng Neon branch riêng cho Preview).
- **Kiểm tra:** typecheck/lint 0 lỗi; **380 unit pass** (thêm test origin, generator), **50 integration pass**; build webpack pass. **E2E Chrome 28 pass** + chạy lại bộ AI 5/5 pass gồm **live Groq** (`E2E_AI_LIVE=1`). Lưu ý chạy E2E local: `.env.production.local` (template prod) đè `.env.local` khi `next start` → phải tạm cất file đó; `.env.local` có `RESEND_API_KEY` → chạy với `RESEND_API_KEY=` để mail về Mailpit.
- **Đánh đổi đã được user đồng ý:** thu hồi session ở thiết bị khác trễ tối đa 5 phút do cookie cache.
- **Chưa làm (follow-up):** prefetch dữ liệu trang trên server bằng `HydrationBoundary`; gộp N+1 progress ở Home (3 request song song); giảm weight font.

### 2026-10-04 19:37 +07: ✅ Hạ tầng deploy Vercel free + chia nhỏ xử lý AI (resumable)

- **Mục tiêu:** chạy free hoàn toàn trên Vercel Hobby (giới hạn 60s/request), DB Neon, rate limit Upstash free, email Resend (user đã có domain), lưu file AI qua Supabase Storage (S3-compatible). Chi tiết kế hoạch: `~/.claude/plans/ch-nh-s-a-app-n-y-soft-orbit.md`.
- **AI job từ SSE 600s → resumable step:** thêm cột `ai_generation_jobs.state jsonb` (migration `drizzle/0004_panoramic_pretty_boy.sql`). `runJob` → `stepJob` ([src/server/ai/jobs.ts](../src/server/ai/jobs.ts)) chạy từng lát (ngân sách ~40s): extract theo lô trang PDF (`extractPdfPages` mới trong [extract.ts](../src/server/ai/extract.ts)) / từng file, rồi generate 1–2 chunk/bước, rồi finalize (giữ nguyên transaction quota chống trừ khi cancel). Route bỏ `/jobs/:id/stream`, thêm `POST /jobs/:id/step`, `maxDuration=60`. Client [api-generator.ts](../src/features/ai-generate/lib/api-generator.ts) polling `/step` thay vì đọc SSE (không dùng http-client vì timeout 15s quá ngắn).
- **Khác:** `db/client.ts` `max:1` cho serverless; thêm route cron `/api/cron/cleanup` (bảo vệ bằng `CRON_SECRET`, bearer) + `vercel.json` (buildCommand `pnpm build`, cron 0 18 * * *); `CRON_SECRET` vào env-schema; `.env.example` dọn lại + ghi chú Supabase/R2.
- **Nghiệm thu local:** typecheck + lint (các file đã sửa) sạch; **377 unit pass**, **45 integration pass** (ai-jobs test viết lại theo vòng lặp stepJob; e2e ai-backend đổi stream→step). `pnpm build` webpack pass, route `/api/cron/cleanup` xuất hiện. Chạy thật qua trình duyệt: import text 5 cặp → 2 bước → done 5 thẻ (không gọi Groq); prompt-only Groq thật → done 6 thẻ; cancel/quota giữ đúng. Cron trả 401 khi thiếu/sai bearer.
- **Còn chờ (production, cần credentials của user):** tạo Neon/Upstash/Supabase Storage/Resend (verify domain), set env trên Vercel, chạy `pnpm db:migrate` vào DB prod, deploy rồi đăng ký thử nhận mail thật. `maxDuration=60`: file OCR rất lớn vẫn có thể cần nhiều bước/giữ tab mở; nếu cần hơn → Pro.
- **Bảo mật:** `.env.example` hiện không còn secret; **user cần rotate** `GROQ_LLM_API` + `RESEND_API_KEY` (đã từng lộ trong file).
- **Lint:** sửa 2 lỗi `react-hooks/purity` trong [ReviewQueue.tsx](../src/features/srs/components/ReviewQueue.tsx) bằng helper `nowMs()` ở module scope. `pnpm lint` giờ 0 error (còn 1 warning cũ: import `StarButton` không dùng trong FlashcardDeck.tsx).


### 2026-10-04 16:13 +07: ✅ Phase 3 hoàn tất local + Groq thật; bắt đầu Phase 4

- Upload signed5phút, magic/size/ZIP/pixel/page checks; private local files + R2/S3 adapter. Job/aux usage migrations đã chạy. PDF tổng30trang được preflight trước OCR để ngăn tốn API với job vượt giới hạn.
- Groq strict JSON + bounded normalization, chunk25k/concurrency3, cancellation/timeout/Retry-After, conditional completion/quota. DB quota atomic5successful/ngày00:00Việt Nam; errors/cancel không trừ; auxiliary50/ngày/refund errors. SSE và quota/history24h đã nối HTTP UI, không còn mock badge HTTP.
- Phonetics preview/save, examples preview và semantic grading tùy chọn đã nối UI3ngôn ngữ. `.env.example` thêm S3/model/AI switch, secret không expose.
- **21 live eval cases pass:** schema/count/language/literal-reference accuracy/pinyin-present100%, injection0. Có PDF HSK2 thật10trang→20thẻ với pinyin/nghĩaViệt, ChinesePDF10trang, ảnhEnglish/Chinese, DOCX/CSV/TXT/injection. Report successful cost estimate~$0.0126. Đây là synthetic controlled references, không tuyên bố independent human assessment.
- **357 unit pass** (97.11% lines), **44 integration pass** (93.42% lines), full browser **28pass+1liveopt-in skipped**; live provider flow đã chạy riêng **5/5pass**. Sau UIprogress cập nhật, targetedAI4pass+1live skip. Lint/typecheck/build webpack pass; build cuối sau PDF preflight đã pass.
- Sửa bug short-textPDF bị OCR không cần thiết; thêm actual scannedPDF rendering test. Review trực tiếp quyền/quota/cancel/upload/token; không có subagent độc lập.
- Cleanup24h qua `pnpm db:cleanup` đã chạy; production cron/R2 CORS+lifecycle chờ credentials/P6, không tự cài cron hệ thống. State không đánh dấu liveR2 hoặc independent review là hoàn tất.
- Bắt đầu Phase4 theo spec; đã đọc tài liệu ts-fsrs, chuẩn bị pure learn/scheduler/timezone logic trước UI.


### 2026-10-04 15:46 +07: ✅ Phase 2 hoàn tất triển khai và nghiệm thu local HTTP

- Postgres/Better Auth/API/repos/server guards/local import/security settings/CI đã triển khai và test với dịch vụ thật trên máy.
- Full suite **26/26 E2E pass**, gồm tất cả 20 luồng Phase1 trong HTTP mode và 6 backend flows. **341 unit pass**, **18 integration pass**, coverage94.23% server lines. Lint/typecheck và production build webpack pass.
- Review cuối sửa API sort cursor, xóa history khi xóa set, trusted IP header, OAuth-only delete cần fresh session, bounded JSON và duplicate import IDs. Review trực tiếp; không có subagent security review độc lập.
- **Còn chờ nghiệm thu bên ngoài:** Google OAuth cần credentials; production Resend/Upstash cần tài khoản/domain; GitHub CI chưa chạy vì không có repo. Không tuyên bố các kiểm tra này đã pass. Phase2 local đủ làm nền cho Phase3.
- Đã cập nhật spec Phase2 và README; bắt đầu Phase3 với Groq. [Groq structured outputs](https://console.groq.com/docs/structured-outputs) và [vision](https://console.groq.com/docs/vision) đã kiểm tra: chọn GPT-OSS cho text và Qwen3.8 cho ảnh, không dùng model Llama4 đã deprecate.


### 2026-10-04 15:33 +07: Phase 2 đã nối backend, đang nghiệm thu
- Người dùng yêu cầu làm hết Phase 2–6 theo thứ tự và báo từng phase xong trong state.
- Đã cài Drizzle/Postgres/Better Auth 1.7.7, Resend, Upstash, SMTP local; Docker Postgres 17 và Mailpit đang chạy. Postgres ở **5433** vì 5432 đang có dịch vụ khác. DATABASE_URL đã cập nhật trong `.env.local`.
- Schema/migration SQL, unique position deferrable, seed, cleanup tombstone >30 ngày; migration dev và test DB đã chạy.
- Auth thật: email/password, xác minh, reset 1 giờ, revoke session; Google có wiring nhưng chưa có credentials nên ẩn nút. Email local gửi Mailpit, live dùng Resend.
- Service + `/api/v1` cho sets/progress/test/game/activity/import/profile/delete; origin checks, Zod, payload bound, no-store, requestId, rate limit. Chưa review cuối.
- HTTP auth repository + DataProvider + server layout/proxy guards; verify/reset pages, account security, local import banner. App mặc định local dev hiện chạy HTTP từ `.env.local`, `DEPLOYMENT_ENV=local` để test production bundle với SMTP/local limiter.
- Các check hiện tại: 327 unit pass (trước unit HTTP auth mới); 17 integration tests pass, service/API line coverage **95.57%**. 6/7 auth/backend E2E pass; lỗi reset fixture đã sửa, đang chạy suite đầy đủ.
- Build webpack thật đã pass, dùng Google Fonts tải từ mạng. Turbopack vẫn panic ở PostCSS worker, nên script build/dev đã chuyển `--webpack`.
- Docker credential helper bị treo; pull qua config tạm không dùng credential store ở `/private/tmp/siroquizz-docker-config`, không sửa config Docker của người dùng. Images đã cache, services up sau đó không cần pull lại.
- Server thử ở port3000 (exec session13540), E2E server3100 do Playwright quản lý. Cần dừng server thử trước khi rebuild nếu nó đọc cùng `.next`.
- Tiếp tục: full E2E, import/settings/rate-limit E2E, unit HTTP auth, review security, CI Postgres/Mailpit, chỉnh README/env template/spec. Không đánh dấu xong trước khi nghiệm thu; Google live và production services cần credentials từ người dùng.


### 2026-10-04 15:00 +07: Bắt đầu nền tảng Phase 2

- Thêm Compose Postgres/Mailpit, script bật/tắt dịch vụ; chưa kiểm tra runtime Docker do sandbox.
- Env schema có test; kiểm tra server startup qua instrumentation; lỗi chỉ chứa tên biến.
- Chuyển khóa Groq từ `.env.example` sang `.env.local`, giữ template secret-free. Next.js không đọc `.env.example`.
- HTTP transport + repositories sets/progress/test/game/activity: validate output, cookie cùng origin, no-store, timeout, không theo redirect, mã lỗi thống nhất và cursor có giới hạn.
- 4 lỗi HTTP mới đã dịch đủ 3 ngôn ngữ; không tự retry 429.
- CI GitHub Actions cho local mode; chưa chạy trên GitHub (workspace chưa có Git repository).
- Kết quả: lint, typecheck, formatting, `docker compose config --quiet` pass. 327 unit/component tests pass, line coverage 96.37%.
- Production webpack build pass bằng `SWC_NATIVE_BINDING_CACHE=/private/tmp/siroquizz-swc-native NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/private/tmp/siroquizz-font-cache.cjs pnpm exec next build --webpack`. File font response tạm sử dụng đủ 15 font face Be Vietnam Pro từ cache dev hiện có, không thay font trong source. Đây là kiểm tra compile/production output; `pnpm build` mặc định (Turbopack) vẫn bị sandbox chặn mở cổng nội bộ. Webpack không dùng cache font cũng bị chặn tải Google Fonts.
- E2E chưa chạy lại: production server trả `listen EPERM` ở cổng 3100. 20 E2E pass trong mục Phase 1 là kết quả cũ, không phải kết quả phiên này.
- Kiểm tra template không chứa khóa Groq và khóa không xuất hiện trong browser JS đã build.
- Người dùng xác nhận tiếp tục Phase 2 trước, chưa ưu tiên AI.
- Chưa bật HTTP mode; chưa có auth/DB/API thật. Không đánh dấu Phase 2 hoàn thành.

### 2026-10-04 14:38: ✅ Hoàn thành Phase 1

- Kết quả kiểm tra:
  - Lint, typecheck, build sạch.
  - 243 unit/component test pass (96% dòng).
  - 20/20 E2E pass. Test Memory chạy lặp 6 lần đều pass.
- Đã tick toàn bộ bước triển khai và tiêu chí nghiệm thu trong `phase-1-ui-mock.md`. Bảng lộ trình trong `specs/README.md` đã cập nhật.
- Thêm mục "Kế thừa từ review Phase 1" vào `phase-2-backend-auth.md`.

### 2026-10-04 14:30 +07: Xong toàn bộ HIGH/MEDIUM/LOW (trừ #12, #15)

- Đã sửa thêm:
  - Phiên hết hạn xử lý toàn cục, đồng bộ giữa các tab.
  - Đăng xuất bằng điều hướng đầy đủ.
  - Seed bộ mẫu kiểu best-effort.
  - AI: tách thành hook, hủy khi rời trang, dọn listener trong `wait()`.
  - Chặn bấm đúp các nút Lưu/Tạo.
  - Xóa bộ thẻ không còn nháy "không tìm thấy".
- **Việc tiếp theo:**
  1. Test component (#15).
  2. E2E cho tìm kiếm thư viện, làm lại câu sai, phím tắt flashcards.
  3. Chạy lại toàn bộ kiểm tra rồi đánh dấu Phase 1 hoàn thành.

### 2026-10-04 14:28: Sửa lỗi sau review (đang làm)

- Đã sửa và có test: HIGH #1–#5; MEDIUM #6–#11, #13; một phần #14 (bảng trên).
- Refactor:
  - Thêm `src/lib/client-hooks.ts` gồm `useClientValue`, `useHydrated`, `useOnceWhen`, `isTextEntryTarget`, `isActivatableTarget`, `refocusWithin`.
  - Thêm hook `src/features/test/use-test-session.ts`.
  - Tách nhỏ `FlashcardDeck`, `GravityGame`, `SetEditor`, `TestMode`.
- Token màu: `--text-subtle` 54%, `--success` 50%, `--danger` 52% (sáng); `--primary` 54% (tối). Đều đạt WCAG AA, đã tính lại tỉ lệ tương phản.
- Lần chạy gần nhất: unit test 227+ pass, typecheck sạch. Chưa chạy lại E2E sau loạt sửa này.

### 2026-10-04 ~14:10: Review code

- Chạy agent code-reviewer. Kết quả: 0 CRITICAL, 5 HIGH, 10 nhóm MEDIUM, một số LOW (chi tiết ở bảng trên).

### 2026-10-04 ~14:05: Kiểm tra chất lượng

- 18 E2E Playwright pass:
  - auth, redirect, đổi ngôn ngữ
  - tạo / nhập / nhân bản / xóa bộ thẻ
  - flashcards
  - bài kiểm tra 4 dạng đạt điểm tối đa
  - Match, Scramble, Gravity, Memory
  - AI mock (upload `.txt`, hủy)
  - không tràn ngang ở 320/768/1024/1440, sáng và tối
  - axe WCAG 2.1 AA trên 10 trang
- Lỗi bắt được và đã sửa: landing tràn ở 320px; độ tương phản màu; `<dl>` sai cấu trúc; nút Flashcards tràn ở 320px; câu Ghép nối bị bỏ chọn ngoài ý muốn.

### 2026-10-04 ~13:20–14:00: Xây dựng Phase 1

- Scaffold Next.js 16.3 + React 19.3 + Tailwind 4.3 + next-intl 4 + TanStack Query 5 + zod 4 + radix-ui + Vitest 5 + Playwright 1.63.
- Các màn hình:
  - Landing, đăng ký, đăng nhập, quên mật khẩu
  - Home, Thư viện
  - Trình soạn (có dialog Nhập), Tổng quan bộ thẻ
  - Flashcards, Kiểm tra, Hub trò chơi + 4 game
  - Tạo bằng AI (mock), Cài đặt, 404
- 3 bản dịch vi/en/zh.
- **Khác kế hoạch:**
  - Bỏ font web Noto Sans SC (tải ~100 file bị timeout). Chữ Hán dùng font hệ thống: PingFang SC, Microsoft YaHei, Noto CJK.
  - E2E dùng biến `PW_CHANNEL`.

### 2026-10-04 ~13:15: Lập kế hoạch

- Chốt với người dùng:
  - Next.js + TS + Tailwind
  - Mock data chạy được
  - UI 3 ngôn ngữ Việt / Trung / Anh
  - 4 trò chơi: Ghép thẻ, Rơi từ, Lật thẻ trí nhớ, Xếp chữ
- Tạo `specs/` gồm README, architecture và phase 1–6.
