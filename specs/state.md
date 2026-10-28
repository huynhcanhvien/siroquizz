# Trạng thái dự án & nhật ký bàn giao

> File này ghi lại **đã làm gì, đang làm dở gì, làm tiếp thế nào** để bất kỳ ai (người hoặc agent) cũng có thể tiếp tục.
> Thời gian theo giờ Việt Nam (UTC+7). Mục mới nhất ở trên cùng của phần Nhật ký.

**Cập nhật lần cuối:** 2026-10-29 03:05 +07
**Phase hiện tại:** AI (tốc độ + credit) xong trên nhánh `feat/ai-pipeline-speed` (PR #1 vào `main`, **chưa merge**). Phase 5 cộng đồng **hoàn tất (đợt 1–6)** trên nhánh `feat/phase5-community` (tách từ nhánh AI, chưa push/PR). Phase 4 (SRS) vẫn đang dở.
**Tình trạng:** Người dùng yêu cầu hoàn thành toàn bộ Phase 2–6 và cập nhật state khi từng phase xong. Không coi credentials, deployment hay beta bên ngoài đã hoàn tất nếu chưa thực hiện.

## Tóm tắt nhanh cho người tiếp quản

- **Nhánh:** `main` = production (user deploy từ đây, **không commit thẳng**). `feat/ai-pipeline-speed` (PR #1 → main) ⊂ `feat/phase5-community` (đang làm, chưa push).
- **Migration mới chưa chạy trên Neon:** 0006–0013 (chỉ thêm cột/bảng/index; 0010 cần `CREATE EXTENSION pg_trgm`). Migrate local phải truyền `DATABASE_URL` local tường minh (drizzle.config đọc `.env.production.local`).
- **E2E:** cổng 3100 có thể bị dự án `trip-expense-tracker` của user chiếm → `E2E_PORT=3200 RESEND_API_KEY= PW_CHANNEL=chrome pnpm e2e`, tạm cất `.env.production.local` khi chạy.
- **Admin:** `DATABASE_URL=<url> pnpm admin:grant <email>` (kiểm tra quyền admin luôn đọc DB).

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

**Bước tiếp theo:** (1) user merge PR #1 sau khi chạy migration 0006–0008 trên Neon; (2) push `feat/phase5-community` + tạo PR (migration 0009–0013); (3) các mục bảo mật còn để lại (xem nhật ký đợt 6); (4) quay lại Phase 4 (SRS) phần còn dở.

## Nhật ký

### 2026-10-29 +07: 🚀 Phase 7 lên production (PR #14, merge 1637ac0)

- Migration 0016–0019 đã chạy trên Neon (URL direct) trước khi merge; `__drizzle_migrations` = 20 hàng, có đủ 6 bảng mới và 3 cột mới.
- CI mới (quality, build, e2e 3 shard) xanh ngay lần chạy đầu; Vercel build webpack thành công và deploy production.
- Kiểm tra production: `/`, `/login`, `/explore` trả 200; các route API mới trả 401 `UNAUTHENTICATED` khi chưa đăng nhập (không 404); các trang viết bài, đề xuất và thư viện chuyển về `/login`; cron dọn dẹp chạy tay trả 200 `{removedUploads:0, removedImages:0, purgedSessions:0, moderated:0}`.
- Sửa thêm trước deploy: chỉ người nhận bộ qua lớp mới được đề xuất sửa (`access.canPropose`); người chỉ có link nhận 403.
- Còn lại: kịch bản tay 3 trình duyệt trên production (D§2), đo số liệu (D§3), theo dõi số lần gọi function khi cả lớp cùng viết.

### 2026-10-29 03:05 +07: ✅ WP6 nghiệm thu & review xong trên nhánh `wp6-acceptance` (tách từ `feat/class-collab-writing` e270bd3, chưa merge)

- **Kiểm thử:** lint/typecheck sạch; unit 678 (dòng 95,9%, nhánh 90,3%); integration 306 (dòng 94,0%, nhánh 84,0%) trên DB riêng `siroquizz_wp6_test`; `pnpm build` xanh. E2E toàn bộ 2 lần liên tiếp trên `siroquizz_wp6` (`DEPLOYMENT_ENV=local E2E_PORT=3240 RESEND_API_KEY= PW_CHANNEL=chrome`): **138 pass, 2 skip** (Groq live, credit publish) mỗi lần. `study`/`starred-flashcards`/`flashcard-corrections` xanh sau khi `readSets` đọc chi tiết bộ. Lần đầu `class-library` timeout lúc đăng ký khi server vừa khởi động lạnh, chạy lại xanh (10s).
- **E2E mới `collab-quality.spec.ts`:** `/classes/[id]` (GV + HS), `/classes/[id]/writing`, `/sets/[id]/propose`, `/sets/[id]` (viewer), `/library?tab=class`, `/study/writing/[sessionId]` (GV + HS) ở 375/1440, sáng/tối: không tràn ngang, axe WCAG 2.1 AA sạch. Tìm ra trang viết bài không có `<main id="main">` (skip link hỏng) và không có lề trên điện thoại → đã sửa.
- **Review (code + bảo mật), không có CRITICAL/HIGH. MEDIUM đã sửa kèm test:** cộng tác viên sửa bộ public không còn đưa verdict `flagged`/`rejected` về `pending` (mở lại link + tiêu quota kiểm duyệt của chủ); quyền sửa cấp đích danh hết hiệu lực khi không còn chung lớp với chủ; token continuation AI aux ký kèm digest các thẻ còn lại (trước đó replay được 15 phút để làm miễn phí bộ khác); bộ chia sẻ vào thư viện lớp chỉ vào hàng ôn tập chung khi đã học (trước đó mọi bộ chia sẻ đổ thẻ mới vào); GV đổi cài đặt phiên không còn dựng lại editor đang mở; nhãn editor không dựng lại Quill; `syncNow` không để lại timer thừa; tab mở ở nền bắt đầu ở trạng thái tạm dừng.
- **Còn để lại (MEDIUM/LOW, ghi ở `specs/phase-7-collab-writing.md` §Review):** người xem qua link (không cùng lớp) vẫn gửi được đề xuất (đúng quyết định #3 nhưng có thể spam hàng chờ 20; note không qua kiểm duyệt); học sinh nhận danh sách thành viên đầy đủ qua phiên viết (để tô màu); `baseUpdatedAt` là tuỳ chọn; duyệt đề xuất cũ ghi đè thay đổi mới (chỉ báo `stale`); GET doc/ảnh/list chưa có rate limit riêng; chưa đo CPU của update Yjs độc hại; token của batch AI lỗi không cộng vào trần ngày; migration 0016 tạo index không `CONCURRENTLY` (khoá ghi vài giây).
- **Tài liệu:** `specs/phase-7-collab-writing.md` mới (schema, phân quyền, route, giao thức sync, giới hạn, ngân sách polling, migration 0016–0019, ghi chú deploy); `specs/README.md` thêm Phase 7; `specs/phase-5-community.md` §5 trỏ sang Phase 7.
- **Deploy:** chạy `DATABASE_URL=<neon-direct> pnpm db:migrate` **trước** khi merge vào `main`; không có biến env mới. Chưa làm: kịch bản tay 3 trình duyệt (D §2) và số liệu trước/sau (D §3).

### 2026-10-29 02:40 +07: 🧱 WP2 (A7–A13) + WP4 (C1–C13) xong trên nhánh `wp2-wp4-ai-writing` (đã rebase lên `feat/class-collab-writing`, chưa merge)

- **WP2:** tác vụ phụ AI chia lô 40 thẻ, id theo chỉ số, deadline 45s, trả `partial`/`remainingIds`/`retryAfterMs` + continuation ký HMAC (lượt tiếp không trừ quota); token job đặt trước (`tokens_reserved`) và token aux/kiểm duyệt (`ai_aux_usage.tokens`) tính vào trần ngày (migration `0018_nasty_black_bird`); tài liệu dài/ít thẻ đọc theo phần ≤ 6.500 token (100k token/10 thẻ: 40 → ≤ 16 request); state job không giữ text 2 lần, poll queued không đọc state; PDF đọc mọi trang text trong 1 step, inspect tiếp tục được qua nhiều step; hướng dẫn tĩnh vào system prompt; cron kiểm duyệt không vỡ khi timeout, lease 58s, backoff mạng. `pnpm ai:eval`: trước/sau đều 1.0 mọi chỉ số; sau: 13.725 token prompt, 1.536 cached.
- **WP4:** phiên viết bài trực tuyến (Quill 2 + Yjs + y-quill nạp động chỉ ở `/study/writing/[sessionId]`, ~78 KB gz), đồng bộ polling 2s/10s có fast path 1 select, mirror localStorage + keepalive, màu chữ theo vai trò, roster giáo viên, bộ thẻ tạm → tạo bộ thẻ và chia sẻ vào thư viện lớp qua `shareToClass`. Migration `0019_ancient_randall`.
- Kiểm thử: unit 658 (dòng 95,9%), integration 293 (dòng 94,0%), e2e `writing` (2) + `classes` xanh; lint/typecheck sạch; build xanh.

### 2026-10-29 02:09 +07: 🧹 WP5 (A14–A19) xong trên nhánh `wp5-cleanup-ci` (chưa merge)

- **Dọn dẹp:** cron xoá `card_images` mồ côi > 24h kèm object S3 (`cleanupOrphanCardImages`); upload AI hết hạn xoá theo lô `DeleteObjects` ≤ 1000 + một `DELETE … IN (…)` (`deleteStoredObjects` trong `storage.ts`). Không migration.
- **Rate limit đăng nhập:** Better Auth dùng `customStorage` Upstash (`src/server/auth-rate-limit.ts`) khi có `UPSTASH_REDIS_*`, không thì memory. Không dùng `secondaryStorage` vì nó kéo session sang Redis.
- **CI:** job `quality` 1 lần, job `build` upload `.next`, `e2e` 3 shard chạy `next start` với `E2E_PREBUILT=1`; cache `.next/cache` và trình duyệt Playwright.
- **Turbopack:** `next build` không flag nay build được trên máy này (không còn panic PostCSS), nhưng compile 3,7 phút so với 17 giây webpack → `build`/`dev` vẫn webpack; thêm `build:turbopack`/`dev:turbopack` để thử trên Vercel Preview.
- **Ôn tập/Học/Thẻ ghi nhớ:** mỗi câu chỉ đánh dấu `due`/`stats`/`progress` stale (không refetch); làm mới 1 lần sau lần lưu cuối của phiên.
- **Kiểm thử:** unit 560, integration 252 (dòng 92,5%), e2e `learning.spec.ts` xanh (cả chế độ `E2E_PREBUILT=1`). **Lưu ý:** `study.spec`, `starred-flashcards.spec`, `flashcard-corrections.spec` đỏ từ trước WP5 vì fixture `findSet` đọc `set.cards` từ `GET /sets` mà WP1 đã bỏ thẻ khỏi danh sách.

### 2026-10-29 01:55 +07: 🧱 WP1 (A1–A6) + WP3 (B1–B10) xong trên nhánh `wp1-wp3-foundation-collab` (chưa merge)

- **WP1:** rate limit ghi theo đường dẫn (`src/server/write-policy.ts`: tiến độ/ôn tập 120/phút, AI upload/step bỏ qua bucket chung); index FK cascade (migration `0016_mighty_steel_serpent`; xoá bộ 500 thẻ trên 100k progress+logs: 13 ms có index so với 4.400 ms không index); `listSets` trả `cardCount` + `progress` thay vì thẻ; khoá `FOR KEY SHARE` khi ghi tiến độ; `putProgress` 500 thẻ từ 4.003 xuống ≤ 10 query; tách `replaceDeck`/`writeSetFields`/`toCardDto`.
- **WP3:** thư viện lớp (chia sẻ bộ/thư mục, audience giáo viên | cả lớp), cộng tác viên (người hoặc mọi giáo viên của lớp), đề xuất sửa chờ duyệt, công tắc "Nhận đóng góp", phát hiện xung đột `baseUpdatedAt` → 409 `SET_CHANGED`. Migration `0017_great_mikhail_rasputin`. Router mới `src/server/collab-api.ts` gọi đầu `communityApi`.
- Kiểm thử: unit 551 (coverage dòng 95,5%), integration 247 (dòng 92,6%), e2e `class-library`, `classes`, `folders` xanh.

### 2026-10-06 14:03 +07: ✅ Khu quản trị hoàn tất, mọi kiểm tra pass

- E2E toàn dự án 44 pass, 2 skip (Groq live). Lỗi auth/thư mục ở lượt trước là do tải, không tái hiện.
- Sửa race trong E2E hủy job của admin: job thuộc user khác thay vì chính admin (trình duyệt admin tự chạy tiếp job của mình), chờ toast thay vì chờ bảng bị ẩn sau dialog, dòng bộ thẻ xác định bằng link chủ sở hữu.
- Typecheck, lint (0 lỗi), unit 456, integration 169, build đều pass. Tick tiêu chí nghiệm thu cuối trong `specs/adminpage.md`.
- Tiếp theo: push `feat/admin-console` + PR vào `main` (không cần migration).

### 2026-10-06 13:23 +07: Khu quản trị đã có layout và UI; đang xác nhận E2E hồi quy

- Nhánh `feat/admin-console`: hoàn thành Bước 2–3 trong `specs/adminpage.md`, gồm layout bảo vệ bằng DB, menu 6 mục, tổng quan, kiểm duyệt, người dùng/chi tiết, AI & credit, bộ thẻ và audit.
- `src/features/admin/` có bảng responsive, bộ lọc/cursor URL, confirm cho thao tác nguy hiểm, cấp quyền hai bước, TanStack Query + toast. Bản dịch vi/en/zh chuyển sang `admin.*`; UserMenu đổi thành Quản trị.
- Review code/security độc lập phát hiện và đã sửa race thu quyền/khóa giữa admin, job đọc state không khóa khi hủy, cancellation thiếu audit nguyên tử và ledger.ref sai audit ID. Có integration regression; security reviewer đã đọc lại bản sửa.
- Unit **456 pass**; integration toàn dự án **168 pass** trước test ban đồng thời bổ sung; suite admin hiện 17 test. Lint 0 lỗi/2 cảnh báo cũ; typecheck/format/build pass.
- E2E admin đã pass luồng quản lý user/credit/audit, axe + 320/768/1440 ở sáng/tối. Test hủy job, ẩn/khôi phục/history và đổi ngôn ngữ cũng đã pass. Full E2E 46 test đang chạy; test auth đăng xuất và test thư mục đã thất bại, chưa tick nghiệm thu cuối.
- Còn lại: xác nhận lượt E2E toàn dự án, kiểm tra lại lỗi auth/thư mục trước nghiệm thu. Chi tiết tiến độ tại `specs/adminpage.md`. Không cần migration mới; chưa push/PR.

### 2026-10-06 12:02 +07: 🛠️ Khu quản trị: Bước 1 (server) xong

- Nhánh `feat/admin-console` (tách từ `main`).
- Router mới `src/server/admin-api.ts`; `community-api.ts` chuyển mọi `admin/*` sang đây. Service mới trong `src/server/services/admin/` gồm overview, users, credits, jobs, sets, audit và schemas.
- `stopJob` được tách ra khỏi `cancelJob` để admin hủy được job của người khác. `audit()` nhận thêm `targetType: "job"`.
- Kiểm tra: typecheck sạch; lint còn 2 cảnh báo có từ trước; 453 unit pass; 164 integration pass (12 test mới); coverage của `services/admin` đạt 100% số dòng.
- Tiếp theo: Bước 2 (layout `/admin` và menu con). Chi tiết ở `specs/adminpage.md`.

### 2026-10-06 11:54 +07: 📝 Kế hoạch khu quản trị `/admin`

- Lập kế hoạch mở rộng `/admin` thành khu quản trị riêng (6 trang: tổng quan, kiểm duyệt, người dùng, AI & credit, bộ thẻ, nhật ký). Chi tiết ở `specs/adminpage.md`.
- Chưa viết code, đang chờ người dùng xác nhận. Nhánh dự kiến `feat/admin-console`.

### 2026-10-06 11:23 +07: ⚡ AI chạy nền + OCR trên máy người dùng + credit theo số thẻ

- **Vấn đề người dùng báo:** PDF scan 10 trang tiếng Trung đọc mất ~8 phút và đọc xong là hết 20 credit. **Gốc:** model vision `qwen3.8` gói free bị giới hạn **1.000 token đầu ra/phút** (~1 trang/phút; trang dày bị cắt, sót dòng); OCR 3 trang song song bị chặn rồi đọc lại (tính token 2 lần); credit tính theo token.
- **OCR trên trình duyệt:** PP-OCRv4 (det + rec ONNX) qua ONNX Runtime Web trong Web Worker; pipeline TS thuần (`src/features/ai-generate/ocr/ppocr.ts`) theo RapidOCR, dùng **khung xoay theo hướng dòng** (scan nghiêng không mất dòng). Đo trên file 10 trang của người dùng: **34 s trong Chrome** (gồm tải model), 4.579 chữ Hán, sát bản gốc; Tesseract.js đã thử nhưng sai nhiều đúng ở từ vựng (斟→骂, 劝→动). Áp dụng khi ngôn ngữ thuật ngữ là zh/en; còn lại server OCR (tuần tự, 1.000 token/request, 1 credit/trang).
- **Credit:** 1 credit = 4 thẻ thật sự tạo ra; job lỗi một phần trả ít hơn; cache miễn phí; tự hủy trả cho thẻ đã tạo + trang server đã OCR. Trần toàn app chuyển sang token.
- **Chạy nền:** provider toàn app; rời trang không hủy job; chỉ báo nổi + toast; tải lại trang tự chạy tiếp.

### 2026-10-06 09:11 +07: 🔒 Phase 5 đợt 6 — Review bảo mật (nhánh `feat/phase5-community`)

- Agent security-reviewer: **không có CRITICAL**; access rules, admin (role đọc DB), CSRF (Origin), SQL, XSS, CSV, slug/mã lớp được xác nhận ổn.
- **Đã sửa:**
  - **H1 lách kiểm duyệt:** sửa nội dung/tag/ảnh ở **mọi** chế độ hiển thị đều xóa phán quyết cũ (`markEdited`: public → `pending` + kiểm tra lại, còn lại → `none`); bộ `flagged`/`rejected` đóng mọi link (cả unlisted) cho tới khi chủ sửa.
  - **H2 cày credit:** thưởng công khai chỉ khi tài khoản ≥ 24h và tối đa 3 lần/ngày; xóa bộ đã thưởng → thu hồi; nhân bản bộ người khác (`duplicateSet`) giữ `copiedFromId` nên không được thưởng khi đăng lại.
  - **M1:** đưa tag vào kiểm duyệt, gói nội dung bộ thẻ trong JSON "untrusted" (giảm prompt injection); gắn ảnh cũng kiểm duyệt lại.
  - **M2:** gọi model kiểm duyệt tối đa 10 lần/giờ/người (vượt → `pending`, cron xử lý) — không ai làm cạn hạn mức chung hay "quay lại" phán quyết.
  - **M3:** thời gian Ghép thẻ không thể nhỏ hơn thời gian thực trên server (trừ 5s) → bot không đứng đầu bằng sự kiện giả.
  - **M5:** chủ tài khoản đã xóa ⇒ bộ chia sẻ/được giao offline (như bị khóa). **M6:** mọi request ghi kiểm tra `banned_at`/`deleted_at` trong DB (không chờ cookie 5 phút).
  - **L1** admin không xem bộ private; **L2** PATCH lớp không còn xóa mô tả; **L3** đổi username: cooldown tính từ lần đặt đầu; **L9** kiểm tra chủ ảnh trước khi xử lý file.
- **Để lại (rủi ro thấp, cần quyết định sản phẩm):** M4 giới hạn tham gia lớp theo IP + gộp lỗi "không có lớp"/"đã khóa"; L4 bảng tiến độ dựa trên dữ liệu học sinh tự gửi; L5 bộ của đồng giáo viên đã rời lớp vẫn được giao; L6 `ownerId` trong payload; L7 tùy chọn ẩn tên trên bảng xếp hạng; L8 đổi slug khi chia sẻ lại; L10 tham số folder của hàng ôn tập; L11 rate limit tìm kiếm Khám phá theo IP + chống thổi "phổ biến" bằng tài khoản ảo; L12 giới hạn báo cáo chưa nguyên tử; chống trùng nội dung bộ thẻ bằng hash.
- **Kiểm tra:** 429 unit, **152 integration** (thêm 8 test hồi quy cho các lỗ hổng trên), **E2E 40 pass** (3 worker; test thưởng live lùi tuổi tài khoản 2 ngày).

### 2026-10-06 08:46 +07: 🧾 Tóm tắt phiên 2026-10-05 (AI + credit + Phase 5 đợt 1–5)

> Ghi chú: các mục nhật ký 17:10 / 18:20 / 19:30 / 21:00 bên dưới dùng giờ **ước lượng**, không phải giờ hệ thống; thứ tự các mục vẫn đúng.

**1. AI tạo bộ thẻ: sửa lỗi + tăng tốc** (nhánh `feat/ai-pipeline-speed`, commit `f4c0755`, `9cce309`; PR #1)

- Nguyên nhân lỗi chính đo được: chunk 25k ký tự vượt hạn mức free 8k token/phút → `413` 100% với tài liệu > ~15k ký tự. Thay bằng chunk theo token (~2.500), `reasoning_effort: low`, deadline theo bước, model dự phòng `gpt-oss-20b`, OCR song song, hàng đợi FIFO dùng chung một key, client tự chạy lại bước, step lease, báo phần bị bỏ qua.
- Đo live: tài liệu 60k ký tự xong ~96s (85s là chờ hạn mức free), không lỗi; eval 21 case đạt 100%.

**2. Credit AI** (commit `55153f7`): 1 credit = 1.000 token; 20 credit miễn phí/ngày (reset 0h, không cộng dồn) + credit thưởng không hết hạn (`credit_ledger`); báo giá + màn hình xác nhận; chỉ hoàn khi lỗi hệ thống; 40 credit/lần, 10 trang OCR, 2 job/người, trần toàn app; cache kết quả 30 ngày; lấy mẫu ~8 thẻ/chunk (20 thẻ từ tài liệu 60k: 41 → 11 credit).

**3. Phase 5 cộng đồng** (nhánh `feat/phase5-community`)

- Đợt 1 `e3bc8e2`: chia sẻ private/unlisted/public + `/s/[slug]` + QR, `access.ts`, kiểm duyệt tự động (`gpt-oss-safeguard-20b` trên Groq + regex liên hệ), báo cáo, trang `/admin`, audit log, nối credit thưởng (+5 công khai được duyệt, +1/lượt sao chép, thu hồi khi gỡ).
- Đợt 2 `70e33c3`: `/explore` (tìm không dấu, pg_trgm, tag, phổ biến tuần), hồ sơ `/u/[username]`.
- Đợt 3 `e2c1878`: thư mục, kéo-thả, học cả thư mục (Ôn tập lưu; Thẻ/Kiểm tra là luyện tập).
- Đợt 4 `d30d65b`: lớp học, giao bài, bảng tiến độ + CSV, `requireStudySet`; sửa rò rỉ trường nội bộ trong response bộ thẻ.
- Đợt 5 (commit cùng bản tóm tắt này): bảng xếp hạng Ghép thẻ/Rơi từ, server cấp seed và **chơi lại sự kiện** để tính kết quả (loại thao tác < 300ms, sai bàn, thời gian vượt thực tế); bảng `game_sessions` (**migration 0013**); người đăng nhập học/chơi trực tiếp bộ được chia sẻ (`sharedForStudy`); nút "Học ngay" trên trang công khai; nút Bắt đầu hiện "Đang chuẩn bị ván…". Test: 429 unit, 144 integration, `games.spec.ts` + `study.spec.ts` pass 18/18 khi chạy riêng.
- **Đã xử lý sau đó:** các lần chạy E2E cả bộ hay có vài test timeout ngẫu nhiên (lần nào cũng khác test). Nguyên nhân: 4 worker mặc định làm quá tải máy 8 lõi đang chạy cả server Next, Postgres và Chrome. Đặt mặc định `workers: 3` (đổi bằng `E2E_WORKERS`) → **40/40 pass trong 3,2 phút** (4 worker: 4,3 phút và có timeout). Thêm `test.describe.configure({ timeout: 90_000 })` cho các file E2E nhiều người dùng.

**Quyết định của user trong phiên:** key Groq free duy nhất → cần hàng đợi; credit như trên; tài liệu AI mặc định riêng tư, công khai được thưởng, có kiểm duyệt; làm Phase 5; merge nhánh credit vào nhánh AI và tạo PR vào `main`.

### 2026-10-05 21:00 +07: 🏫 Phase 5 đợt 4 — Lớp học (nhánh `feat/phase5-community`)

- **Schema (migration `drizzle/0012_premium_dormammu.sql`):** `classes` (mã tham gia 6 ký tự không nhầm lẫn, `join_locked`), `class_members` (owner/teacher/student), `class_sets` (`due_at`).
- **Quyền học qua lớp:** `requireStudySet` ([access.ts](../src/server/services/access.ts)) = chủ bộ **hoặc** bộ được giao cho lớp mình (chưa bị ẩn). Thay `requireOwnedSet` ở mọi API học (tiến độ, kiểm tra, game, hoạt động, ôn tập, sao, phiên học, `GET /sets/:id`); sửa/xóa/chia sẻ vẫn chỉ chủ. Hàng đợi Ôn tập của học sinh gồm cả bộ được giao. Rời lớp mất quyền ngay.
- **Phát hiện khi làm:** `getSet`/`listSets` trả nguyên hàng DB (`...set`) → lộ slug/kiểm duyệt cho học sinh và **gửi kèm `search_text` (tới 20k ký tự) mỗi bộ** (hồi quy từ đợt 2). Đã chỉ trả các trường client cần.
- **Service** [classes.ts](../src/server/services/classes.ts) + route trong `community-api`: tạo/xem/sửa/xóa lớp, tham gia (≤200 thành viên, `CLASS_NOT_FOUND`/`CLASS_LOCKED`/`CLASS_FULL`), rời, xóa thành viên (giáo viên xóa học sinh; chỉ chủ lớp quản lý đồng giáo viên), giao/bỏ giao bộ của chính mình, `GET /classes/assigned`, bảng tiến độ (chỉ đọc tiến độ của bộ được giao).
- **UI:** `/classes` (dạy/học, tạo, nhập mã), `/classes/join/[code]` (xác nhận trước khi vào), `/classes/[id]` (giáo viên: mã + link mời, khóa, đổi mã, giao bộ + hạn, bảng tiến độ có `<table>` cho trình đọc màn hình + Xuất CSV, thành viên; học sinh: bộ được giao, rời lớp), "Bài được giao" trên Home, trang bộ thẻ ẩn nút của chủ với học sinh (và sửa lỗi dòng "Tạo bởi" hiện tên người xem).
- **Kiểm tra:** **422 unit** (thêm `csv.test.ts`), **140 integration** (thêm `classes.test.ts`, `community-api.test.ts` cho router; coverage lines 91%, branches 79.7%), **E2E 38 pass** (thêm `classes.spec.ts` 2 trình duyệt: giao → học → bảng tiến độ → CSV → rời lớp mất quyền; `/classes` vào quét axe/tràn layout).
- **Deploy:** migration 0012.

### 2026-10-05 19:30 +07: 📁 Phase 5 đợt 3 — Thư mục (nhánh `feat/phase5-community`)

- **Schema (migration `drizzle/0011_marvelous_omega_flight.sql`):** `folders` (tối đa 100/người), `folder_sets` (pk folder+set, `position`, tối đa 500 bộ/thư mục). Chỉ chứa bộ của chính mình; xóa thư mục không xóa bộ; bộ đã xóa mềm không hiện.
- **API:** `GET/POST /folders`, `GET/PATCH/DELETE /folders/:id`, `PUT/DELETE /folders/:id/sets/:setId`, `GET /folders/:id/study` (gộp ≤500 thẻ theo thứ tự thư mục), `GET /sets/:id/folders`, `GET /reviews/due?folder=` ([folders.ts](../src/server/services/folders.ts)).
- **UI:** trang `/folders`, `/folders/[id]` (đổi tên, xóa, bỏ bộ), menu bộ thẻ "Thêm vào thư mục" (checkbox cập nhật lạc quan), Thư viện có dải chip thư mục để kéo-thả bộ thẻ, mục "Thư mục" trong điều hướng (chỉ chế độ http).
- **Học cả thư mục:** Ôn tập `/review?folder=` lưu FSRS bình thường; `/study/folder/[id]/flashcards|test` là **luyện tập không lưu tiến độ** (`FlashcardDeck`/`TestMode` thêm prop `practice`), có nhãn trên thanh trên cùng.
- **Kiểm tra:** 419 unit, **130 integration** (thêm `folders.test.ts`), **E2E 37 pass** (thêm `folders.spec.ts`: tạo, thêm qua menu và kéo-thả, luyện tập không gửi request lưu, ôn theo thư mục, xóa giữ bộ; `/folders` vào quét axe/tràn layout).
- **Deploy:** migration 0011.

### 2026-10-05 18:20 +07: 🧭 Phase 5 đợt 2 — Khám phá và hồ sơ công khai (nhánh `feat/phase5-community`)

- **Tìm kiếm:** cột `study_sets.search_text` = tiêu đề + mô tả + tag + thẻ đã **bỏ dấu tiếng Việt, đ→d, chữ thường** trong code ([search.ts](../src/features/community/lib/search.ts)), index GIN `pg_trgm` (**migration `drizzle/0010_slippery_black_queen.sql`**, có `CREATE EXTENSION pg_trgm`). Không dùng `unaccent` vì không IMMUTABLE nên không index được. "tu vung du lich" → "Từ vựng du lịch", "你好" → bộ có thuật ngữ đó.
- **`/explore`** (trang công khai, server render, trạng thái trên URL qua form GET): lọc ngôn ngữ thuật ngữ/định nghĩa, số thẻ, tag; sắp xếp liên quan/mới/phổ biến; "Phổ biến tuần này" = lượt sao chép trong 7 ngày; chip chủ đề = tag dùng nhiều nhất; phân trang 24/trang (tối đa 20 trang). Chỉ hiện bộ public + approved + không bị ẩn + chủ không bị khóa/xóa.
- **Tag:** tối đa 5, sửa trong hộp thoại Chia sẻ khi công khai (`PATCH /sets/:id/tags`); đổi tag → kiểm duyệt lại.
- **Hồ sơ `/u/[username]`:** username `[a-z0-9_]{3,20}`, chặn từ dành riêng, lần đầu chọn tự do, sau đó 30 ngày/lần (`USERNAME_TAKEN`, `USERNAME_COOLDOWN`); ẩn hồ sơ → 404 với người khác; tổng số bộ/thẻ/lượt sao chép; tên tác giả ở Khám phá và trang bộ thẻ link tới hồ sơ. Cài đặt: mục "Hồ sơ công khai".
- **UI:** header công khai dùng chung (`PublicHeader`), "Khám phá" trong thanh điều hướng (chỉ chế độ http). **Quality spec bắt được 2 lỗi thật:** header tràn 143px ở 320px (đã thu gọn như landing) và tương phản chữ nhỏ `accent-strong` trên `accent-soft` (thêm token `--accent-text`).
- **Kiểm tra:** typecheck/lint 0 lỗi; **419 unit**, **126 integration** (thêm `explore.test.ts`), **E2E 36 pass** (thêm luồng Khám phá → hồ sơ → bộ thẻ; axe + tràn layout cho `/explore`, `/s/…`, `/u/…`). Cổng 3100 đang bị dự án khác của user chiếm → chạy E2E với `E2E_PORT=3200`.
- **Deploy:** thêm migration 0010 (cần quyền `CREATE EXTENSION`, Neon cho phép `pg_trgm`).

### 2026-10-05 17:10 +07: 🌐 Phase 5 đợt 1 — chia sẻ, kiểm duyệt, báo cáo, admin, credit thưởng (nhánh `feat/phase5-community`, tách từ `feat/ai-pipeline-speed`)

- **Kế hoạch Phase 5 theo đợt:** (1) chia sẻ + `access.ts` + kiểm duyệt/báo cáo/admin + nối credit ✅; (2) Khám phá + hồ sơ/username; (3) thư mục; (4) lớp học; (5) bảng xếp hạng; (6) review bảo mật + E2E nhiều người.
- **Schema (migration `drizzle/0009_magenta_valkyrie.sql`):** `study_sets` + `visibility` (private/unlisted/public), `slug` (10 ký tự ngẫu nhiên, không ký tự dễ nhầm), `copied_from_id`, `moderation_status` (none/pending/approved/flagged/rejected), `moderation_reason`, `hidden_at`; `user` + `role`, `banned_at`; bảng `reports`, `audit_logs`.
- **Phân quyền tập trung** [access.ts](../src/server/services/access.ts): `canViewSet` (private chỉ chủ; unlisted ai có link; public khi pending/approved; ẩn/chủ bị khóa/đã xóa → chỉ chủ), `canEditSet`, `isListed`, `isAdmin` **đọc role từ DB** (cookie session trễ 5 phút). Route ảnh thẻ dùng chung luật (khách xem ảnh của bộ được chia sẻ).
- **Chia sẻ** [sharing.ts](../src/server/services/sharing.ts): `PATCH /sets/:id/visibility`, trang server `/s/[slug]` (khách xem + thẻ lật, noindex nếu chưa listed), `POST /public/:slug/copy` (bản sao riêng tư, ghi "Bản sao từ … của …"). Sửa bộ đang công khai → kiểm duyệt lại.
- **Kiểm duyệt** [moderation.ts](../src/server/services/moderation.ts): regex link/SĐT/email trên toàn bộ + `gpt-oss-safeguard-20b` trên mẫu ≤1.200 token; vi phạm → `flagged` (hàng chờ admin), sạch → `approved` + **+5 credit** (một lần/bộ, ≥10 thẻ, không phải bản sao). Model bận → `pending`, cron hằng ngày + nút "Kiểm tra lại".
- **Báo cáo & admin** [reports.ts](../src/server/services/reports.ts), trang `/admin` (menu tài khoản, chỉ admin): báo cáo (≤10/ngày/người, 1 báo cáo mở/người/mục tiêu), bỏ qua / ẩn bộ (thu hồi credit) / khóa tài khoản (xóa mọi phiên, bộ thẻ biến mất); duyệt/từ chối bộ trong hàng chờ; mọi hành động vào `audit_logs`. Sao chép bộ công khai đã duyệt → **+1 credit** cho tác giả.
- **Bug bắt được nhờ test:** điều kiện chống ghi đè kết quả kiểm duyệt so `updated_at` (Postgres micro giây vs Date mili giây) → không bao giờ ghi; sửa bằng `date_trunc('milliseconds', …)`.
- **Kiểm tra:** typecheck/lint 0 lỗi; 415 unit; **118 integration** (thêm `community.test.ts` 23 ca); **E2E 34 pass + 1 skip** (thêm `community.spec.ts`: chia sẻ cho khách, sao chép + báo cáo + admin ẩn, công khai được thưởng — ca live tự skip khi model kiểm duyệt bận).
- **Deploy:** migration 0006–0009 trên Neon; cấp admin bằng `DATABASE_URL=<neon> pnpm admin:grant <email>`.

### 2026-10-05 15:40 +07: 🪙 Credit AI thay cho "5 lượt/ngày" (nhánh `feat/ai-credits`, merge vào `feat/ai-pipeline-speed`)

- **Lý do:** key Groq free có 200k token/ngày/model (bảng giới hạn của Groq). Một tài liệu 60k ký tự tốn ~40k token ⇒ 5 lượt/ngày không giới hạn kích thước cho phép một người dùng hết hạn mức của cả app.
- **Quy tắc (người dùng chốt, sửa 2026-10-06):** 1 credit = **4 thẻ thật sự tạo ra** (+1 credit/trang nếu server phải OCR; đọc trên máy người dùng miễn phí). Trước đó: 1 credit = 1.000 token — 20 credit miễn phí/ngày, reset 0h VN, không cộng dồn; credit thưởng không hết hạn (`credit_ledger`); dùng miễn phí trước; chỉ hoàn khi lỗi hệ thống (`SYSTEM_ERROR_CODES` trong [credits.ts](../src/features/ai-generate/lib/credits.ts)); lỗi người dùng/tự hủy trừ đúng token đã dùng.
- **Luồng:** đọc tài liệu (TXT/DOCX/PDF có chữ không tốn AI) → kiểm tra trước OCR (≤ 10 trang scan, đủ credit cho ~2 credit/trang) → **báo giá** theo token từng chunk. ≤ 5 credit và đủ credit miễn phí → tự giữ credit rồi chạy; còn lại job ở trạng thái mới `awaiting`, màn hình [ConfirmEstimate](../src/features/ai-generate/components/ConfirmEstimate.tsx) cho chỉnh số thẻ (giá tính lại ngay trên trình duyệt bằng cùng hàm) → `POST /jobs/:id/confirm` giữ credit → chạy. Hoàn tất/lỗi/hủy: trừ theo token thực, nhả phần giữ.
- **Giảm chi phí:** chỉ đọc ~1 chunk cho mỗi 8 thẻ, chọn chunk cách đều. Đo live trên tài liệu 60k ký tự: 20 thẻ ước tính 12 / thực 11 credit (trước: ~41); 40 thẻ ước tính 20 / thực 18. Cache kết quả theo hash file + yêu cầu + tùy chọn (`ai_result_cache`, 30 ngày) → 0 credit; không cache yêu cầu chỉ có prompt.
- **Giới hạn:** 50 credit (200 thẻ)/lần tạo, 2 lần tạo chưa xong/người (`AI_BUSY`), toàn app `AI_GLOBAL_DAILY_TOKENS` (token, mặc định 350.000) → `AI_GLOBAL_LIMIT`. Thông báo lỗi cụ thể cho từng mã (vi/en/zh) + câu "đã hoàn credit"/"đã trừ X credit".
- **Code:** `jobs.ts` tách thành [jobs.ts](../src/server/ai/jobs.ts) (API, hàng đợi, lease) + [job-steps.ts](../src/server/ai/job-steps.ts) (các bước, trừ credit); [server/ai/credits.ts](../src/server/ai/credits.ts) (số dư, giữ, trừ, thưởng/thu hồi). **Migration `drizzle/0008_next_screwball.sql`** (bảng `credit_ledger`, `ai_result_cache`, cột credit trên job). Thưởng khi công khai/sao chép đã có hàm + test, **chưa nối** vì Phase 5 (công khai, sao chép, kiểm duyệt) chưa làm — xem `phase-5-community.md` §8.
- **Kiểm tra:** typecheck/lint 0 lỗi; **415 unit**, **95 integration** (thêm `ai-credits.test.ts`), **E2E 32 pass** gồm live Groq và màn hình xác nhận chi phí. Coverage integration lines 88%.
- **Deploy:** chạy migration 0006, 0007, 0008 trên Neon trước khi deploy.

### 2026-10-05 14:40 +07: 🤖 AI tạo thẻ nhanh & ổn định hơn trên Groq free + hàng đợi dùng chung (nhánh `feat/ai-pipeline-speed`, chưa merge)

- **Đo thật trên key free:** 8.000 token/phút **cho mỗi model** (120b, 20b, qwen vision tính riêng); `max_completion_tokens` không bị tính trước. Chunk 25.000 ký tự cũ → **413 "Request too large" 100%** ⇒ mọi tài liệu > ~15k ký tự đều lỗi. `gpt-oss` không tắt được suy luận: `reasoning_effort` chỉ nhận low/medium/high; `low` giảm token suy luận 187 → 39. Groq đôi khi trả 400 `json_validate_failed` (trước đây coi là lỗi hẳn).
- **[groq.ts](../src/server/ai/groq.ts):** `reasoning_effort: "low"` cho gpt-oss; `maxTokens`/`deadline` theo từng lời gọi (không còn timeout 90s > giới hạn 60s của Vercel); 429 có `retry-after` > 3s → ném `RateLimitError(retryAfterMs)` thay vì ngủ trong function; 413 → `AI_INPUT_TOO_LARGE`; `length` → `AI_OUTPUT_TRUNCATED`; tự lấy mẫu lại khi JSON sai schema.
- **Chia chunk theo token ước tính** ([output.ts](../src/features/ai-generate/lib/output.ts) `estimateTokens`/`splitDocument`, 2.500 token, cắt theo dòng; CJK ≈ 1 token/ký tự).
- **[generate.ts](../src/server/ai/generate.ts) mới:** lập tác vụ ≤ 40 thẻ/lời gọi, chạy song song 2 chunk khác nhau, 120b bị giới hạn → chuyển `GROQ_FALLBACK_MODEL` (mặc định gpt-oss-20b, quota riêng); bị cắt → chia đôi; chunk lỗi mãi → bỏ chunk đó, giữ phần còn lại.
- **OCR:** trang PDF scan OCR song song 3 trang, ảnh tối đa 1400px (tốn ít token vision hơn), bị giới hạn giữa chừng thì giữ các trang đã đọc.
- **stepJob** tách theo phase; ngân sách mỗi bước 35s (bắt đầu gọi mới) / 48s (cắt lời gọi đang chạy); trả `retryAfterMs` cho client. Lỗi không rõ → log (không nội dung tài liệu) + mã `INTERNAL` thay vì đổ hết vào `AI_INVALID_OUTPUT`. Log thời gian mỗi bước (`AI job step`).
- **Hàng đợi FIFO dùng chung một key:** chỉ `AI_MAX_ACTIVE_JOBS` (mặc định 2) job được gọi Groq cùng lúc, theo thứ tự tạo (id UUIDv7); job khác trả `status/stage: "queued"` + `queuePosition`, client hiện "còn N lượt trước bạn". Cột mới `ai_generation_jobs.heartbeat_at` (**migration `drizzle/0006_slippery_stranger.sql`**, thêm cột nullable + index) — job không gọi bước > 2 phút không giữ chỗ; job bỏ dở hết hạn sau 10 phút **không hoạt động** (trước: 10 phút kể từ lúc tạo).
- **Client** ([api-generator.ts](../src/features/ai-generate/lib/api-generator.ts)): chờ `retryAfterMs`; tự gửi lại bước khi 502/503/504/mất mạng (tối đa 3 lần liên tiếp) — bước nào cũng resume từ state đã lưu; UI hiện trạng thái xếp hàng / chờ hạn mức.
- **Đo live:** tài liệu 60.000 ký tự (12 chunk) xong trong 96s, 0 chunk lỗi; 85s là chờ hạn mức free (Groq xử lý ~11s). Eval 21 case: schema/count/language/accuracy/pinyin = 1, 0 injection; chi phí ước tính $0.0126 → $0.0091. 1 lần chạy `chinese-10-pages` lệch ngôn ngữ, chạy lại 3/3 đạt → dao động của model, cần theo dõi.
- **Review (agent code-reviewer) — đã sửa 4 HIGH + vài MEDIUM:** đọc body Groq lỗi/timeout giờ là lỗi thử lại được (trước làm hỏng cả job); trình duyệt mất kết nối **không** còn đánh dấu job `cancelled` (job giữ state để resume; hủy thật vẫn qua `/cancel`); `retryAfterMs` kẹp ≤ 60s + quá 10 phút bị giới hạn liên tục không tiến triển → `RATE_LIMITED` (áp dụng cả trích xuất lẫn sinh thẻ); lời gọi mới chỉ bắt đầu khi còn ≥ 18s (launch 30s / hard 48s), timeout → chia nhỏ thay vì trừ lượt; 413 chia văn bản trước; nhiều chunk hơn số thẻ → lấy mẫu chunk cách đều; finalize trùng/cancel → trả kết quả thật của job. Hai MEDIUM còn lại đã làm ở commit sau: **step lease** (cột `step_lease`/`step_lease_until`, **migration `drizzle/0007_wide_sprite.sql`**) — chỉ bước giữ lease (65s, dài hơn giới hạn 60s của function) được chạy và lưu job, bước trùng nhận "đang bận, thử lại sau 2s", bước đã chết thì lease tự hết hạn và lần ghi muộn của nó bị bỏ; **báo phần bị bỏ** — kết quả có `skippedParts/totalParts`, màn hình duyệt thẻ hiện "AI chưa xử lý được X/Y phần…".
- **Kiểm tra:** typecheck/lint 0 lỗi; **402 unit**, **84 integration** (thêm `ai-generate.test.ts`, test hàng đợi, ngắt kết nối, giới hạn tốc độ, lease, kết quả thiếu phần), **E2E 31 pass** gồm live Groq.
- **Cần làm khi deploy:** chạy migration 0006 **và 0007** trên Neon trước khi deploy (truyền `DATABASE_URL` tường minh); tùy chọn đặt `GROQ_FALLBACK_MODEL`, `AI_MAX_ACTIVE_JOBS` trên Vercel (có mặc định).
- **Tiếp theo (Giai đoạn 2/3 đã đề xuất):** trích xuất PDF/DOCX/TXT ngay trên trình duyệt (bỏ upload + mở lại PDF mỗi bước); streaming thẻ ra dần. Người dùng muốn: bộ thẻ AI mặc định riêng tư; công khai thì được cộng credit, đủ credit mở thêm lượt AI; có kiểm duyệt — đã ghi vào `phase-5-community.md` §8, chưa làm (nhánh riêng).

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
