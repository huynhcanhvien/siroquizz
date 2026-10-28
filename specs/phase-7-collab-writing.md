# Phase 7 — Thư viện lớp, cộng tác bộ thẻ, viết bài trực tuyến & tối ưu pipeline

**Trạng thái:** hoàn tất trên nhánh `feat/class-collab-writing` (WP1–WP6, 2026-10-29). Kế hoạch chi tiết: `plan/class-collab-writing/` (README + A/B/C/D). Thay thế `plan/teams.md`.

## Mục tiêu

- Học sinh và giáo viên đưa bộ thẻ / thư mục **của mình** vào thư viện lớp (audience cả lớp hoặc chỉ giáo viên).
- Người xem bộ thẻ gửi **đề xuất sửa** chờ chủ bộ duyệt; chủ bộ cấp **quyền sửa** cho người cùng lớp hoặc cho "toàn bộ giáo viên của lớp".
- **Phiên viết bài trực tuyến** trong lớp: Quill 2 + Yjs, đồng bộ bằng polling (Vercel Hobby không có WebSocket/SSE), màu chữ theo vai trò, roster giáo viên, bộ thẻ tạm → bộ thẻ thật.
- Tối ưu pipeline (A1–A19): batch review/progress, index, payload `GET /sets` không kèm thẻ, AI aux chia lô + continuation, token đặt trước, CI tách job.

Local mode (`NEXT_PUBLIC_DATA_SOURCE=local`) không có các tính năng này (UI gate `=== "http"`, page `notFound()`).

## Schema (migration 0016–0019, chỉ thêm)

| Migration                           | Nội dung                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0016_mighty_steel_serpent` (WP1)   | Thêm index `progress_card_idx`, `progress_set_idx`, `card_stars_card_idx`, `review_card_idx`, `review_set_idx`, `activity_set_idx`, `tests_set_idx` (FK cascade khi xoá bộ/thẻ không còn quét tuần tự). Bỏ `cards_set_idx` — thừa vì unique `cards_set_position_unique (set_id, position)` đã bắt đầu bằng `set_id`.                                      |
| `0017_great_mikhail_rasputin` (WP3) | Enum `library_item_type`, `library_audience`, `collab_principal`, `change_request_status`. Bảng `class_library_items` (unique `class_id,item_type,item_id`), `set_collaborators` (PK `set_id,principal_type,principal_id`), `set_change_requests` (`ops jsonb`, `base_updated_at`). Cột `study_sets.accepts_contributions boolean not null default true`. |
| `0018_nasty_black_bird` (WP2)       | `ai_aux_usage.tokens int not null default 0`, `ai_generation_jobs.tokens_reserved int not null default 0`.                                                                                                                                                                                                                                                |
| `0019_ancient_randall` (WP4)        | Enum `writing_session_status`, `writing_peer_visibility`. Bảng `writing_sessions`, `writing_docs` (`state bytea`, `version`, `text_preview varchar(300)`, unique `session_id,author_id`), `scratch_cards`.                                                                                                                                                |

An toàn trên DB production đang có dữ liệu: mọi cột `NOT NULL` mới đều có `DEFAULT`; không backfill, không đổi kiểu, không ràng buộc mới trên bảng cũ. `CREATE INDEX` (không `CONCURRENTLY`, drizzle-kit chạy trong transaction) khoá ghi các bảng `card_progress`/`review_logs`/… trong vài giây với dữ liệu hiện tại — chạy ngoài giờ cao điểm.

## Phân quyền

Vai trò lớp: `owner` | `teacher` (gọi chung "dạy") | `student`.

| Hành động                                    | Ai được                                                                                                            | Ngoài ra                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xem thư viện lớp                             | thành viên lớp                                                                                                     | học sinh chỉ thấy mục `audience = class`; mục của chủ bị ban / bộ bị ẩn bị lọc                                                                          |
| Chia sẻ vào lớp (`PUT /classes/:id/library`) | thành viên lớp **và** chủ item                                                                                     | tối đa 500 mục/lớp                                                                                                                                      |
| Gỡ khỏi lớp                                  | người chia sẻ hoặc người dạy lớp                                                                                   | rời lớp / bị xoá khỏi lớp → mục mình chia sẻ bị gỡ                                                                                                      |
| Xem bộ thẻ được chia sẻ                      | chủ, collaborator, thành viên lớp có mục chia sẻ (trực tiếp hoặc qua thư mục) theo audience                        | ảnh thẻ của bộ private đi qua `requireStudySet`                                                                                                         |
| Sửa bộ thẻ (`PUT /sets/:id`, ảnh thẻ)        | chủ hoặc collaborator                                                                                              | `baseUpdatedAt` cũ hơn `updated_at` → 409 `SET_CHANGED`                                                                                                 |
| Cấp / thu quyền sửa, bật tắt "Nhận đóng góp" | chỉ chủ bộ                                                                                                         | `user` phải học chung ≥ 1 lớp (403 `NOT_CLASSMATE`); `class_teachers` chủ phải là thành viên lớp; tối đa 50; xoá lớp xoá grant `class_teachers` của lớp |
| Gửi đề xuất sửa                              | người xem được bộ, không phải chủ                                                                                  | `accepts_contributions = false` → 403 `CONTRIBUTIONS_CLOSED`; 20 đề xuất chờ/bộ (409 `CHANGE_REQUEST_LIMIT`); 200 op/đề xuất; 30 đề xuất/giờ/người      |
| Duyệt / từ chối đề xuất                      | chỉ chủ bộ                                                                                                         | 1 transaction, khoá đề xuất + bộ; ghi `audit_logs`; bộ phải còn 2–500 thẻ                                                                               |
| Rút đề xuất                                  | tác giả, khi còn `pending`                                                                                         |                                                                                                                                                         |
| Tạo/sửa/xoá phiên viết                       | người dạy lớp                                                                                                      | 100 phiên/lớp                                                                                                                                           |
| Xem phiên                                    | người dạy: mọi trạng thái; học sinh: khi không còn `draft`                                                         | không phải thành viên / draft → 404 (không dò được id)                                                                                                  |
| Đọc bài                                      | người dạy: mọi bài; tác giả: khi không `draft`; bạn cùng lớp: khi `peer_visibility = open`                         | từ chối đọc → 404                                                                                                                                       |
| Viết bài                                     | phiên `open` và (người dạy, tác giả, hoặc bạn cùng lớp khi `open` + `peer_editing`, chỉ trên bài của **học sinh**) | kiểm lại trong transaction merge (`FOR SHARE` session); phiên đóng → 403 `SESSION_CLOSED`                                                               |
| Gắn thuộc tính `author`                      | chỉ chính người sync                                                                                               | update gắn author khác → 400 (chống giả màu)                                                                                                            |
| Bộ thẻ tạm                                   | chỉ chủ                                                                                                            | 300 thẻ/người; materialize 2–500 thẻ, definition rỗng → 400 `SCRATCH_INCOMPLETE`                                                                        |

## Route mới (`/api/v1/...`)

| Method               | Path                                                 | Ghi chú / limit                                             |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| GET / PUT            | `classes/:id/library`                                |                                                             |
| DELETE               | `classes/:id/library/:itemId`                        |                                                             |
| GET                  | `me/class-library`                                   | tab "Từ lớp" của thư viện, 200 mục                          |
| GET                  | `sets/:id/shares`, `folders/:id/shares`              | chủ                                                         |
| GET / PUT            | `sets/:id/collaborators`                             | chủ                                                         |
| DELETE               | `sets/:id/collaborators/:principalType/:principalId` | chủ                                                         |
| PATCH                | `sets/:id/contributions`                             | chủ                                                         |
| GET / POST           | `sets/:id/change-requests`                           | POST `change-request:<user>` 30/giờ                         |
| GET                  | `change-requests/:id`                                | chủ hoặc tác giả                                            |
| POST                 | `change-requests/:id/{approve,reject,withdraw}`      |                                                             |
| GET                  | `me/change-requests?status=pending[&role=author]`    | Home                                                        |
| GET / POST           | `classes/:id/writing`                                |                                                             |
| GET / PATCH / DELETE | `writing/sessions/:id`                               |                                                             |
| GET                  | `writing/sessions/:id/overview?since=`               | `overview:<user>` 60/phút                                   |
| POST                 | `writing/sessions/:id/docs`                          | mở bài của mình                                             |
| GET                  | `writing/docs/:id`                                   | state base64                                                |
| POST                 | `writing/docs/:id/sync`                              | `sync:<user>` 120/phút + bucket `write-fast`; body ≤ 384 KB |
| GET / POST / DELETE  | `me/scratch-cards`                                   | POST `scratch:<user>` 120/phút                              |
| PATCH / DELETE       | `me/scratch-cards/:id`                               |                                                             |
| POST                 | `me/scratch-cards/materialize`                       |                                                             |

Mọi route ghi khác đi qua bucket ghi chung (`write` 60/phút/người, `src/server/write-policy.ts`). `GET /sets` nay chỉ trả số thẻ (không kèm `cards`); client đọc chi tiết qua `GET /sets/:id`.

## Giao thức sync viết bài

- Client gửi `POST writing/docs/:id/sync` `{ sv, update?, version? }` (base64). Không có `update` và `version` khớp → **fast path** 1 select, không đụng Yjs.
- Có `update`: transaction `select … for update` → áp update Yjs → compaction → kiểm kích thước → ghi `state`, `version+1`, `text_preview` (300 grapheme), `char_count`, `last_editor_id`, `updated_at = clock_timestamp()`.
- Phản hồi `{ version, update?, readOnly, session }`; merge Yjs giao hoán nên không có 409.
- Client (`src/features/writing/lib/sync-loop.ts`, `sync-state.ts`): một vòng sync tại một thời điểm; gõ trong 30 s gần nhất → poll 2 s, rảnh → 10 s, lỗi → backoff tới 60 s, tab ẩn → dừng sau khi flush (`keepalive` ≤ 64 KB). Pending được mirror vào localStorage (7 ngày) nên reload khi offline không mất chữ.
- Roster giáo viên: `overview?since=` (chồng 5 s) mỗi 2 s khi đang xem, 10 s khi không, không chạy nền.

### Giới hạn

| Giới hạn           | Giá trị                                |
| ------------------ | -------------------------------------- |
| State đã nén / bài | 512 KB (413 `DOC_TOO_LARGE`)           |
| Update / lần sync  | 256 KB; body 384 KB; keepalive 64 KB   |
| Dán một lần        | 128 KB (chặn ở editor, có thông báo)   |
| Cảnh báo độ dài    | 20.000 ký tự                           |
| Tiêu đề / đề bài   | 120 / 5.000 ký tự                      |
| Phiên đóng bị xoá  | 180 ngày sau khi đóng (cron hằng ngày) |

### Ngân sách polling (30 học sinh × 45 phút, Vercel Hobby)

Xấu nhất (mọi người gõ liên tục, 2 s): 30 × 1.350 = 40.500 + giáo viên ≈ 2.700 → **~43k request** (< 50k). Thực tế (50% thời gian rảnh 10 s, tab ẩn dừng) **~26k**. Poll rảnh là fast path 1 select có index.

## Bundle

Quill + Yjs + y-quill chỉ nạp ở `/study/writing/[sessionId]` qua `next/dynamic` `ssr:false` (~78 KB gz), không vào bundle chung.

## Ghi chú deploy

1. **Chạy migration trên Neon TRƯỚC khi merge vào `main`** (Vercel deploy ngay khi merge; code mới đọc bảng/cột mới):
   `DATABASE_URL=<neon-direct-url> pnpm db:migrate` — dùng URL direct (không `-pooler`). Kiểm tra `drizzle.__drizzle_migrations` có 20 dòng (0000–0019).
2. Không có biến môi trường mới. Continuation AI aux ký HMAC bằng `BETTER_AUTH_SECRET` sẵn có.
3. `vercel.json` vẫn build webpack (`pnpm build`); cron vẫn một job `/api/cron/cleanup` hằng ngày (nay dọn thêm phiên viết đã đóng > 180 ngày).
4. Sau deploy: thử một phiên viết bài với 2 tài khoản, xem tab Network thấy sync 2 s khi gõ / 10 s khi rảnh / dừng khi ẩn tab.
5. Rollback: code cũ không đọc bảng/cột mới nên có thể revert deploy mà không cần hạ migration.

## Review WP6 (2026-10-29)

Không có CRITICAL/HIGH. Đã sửa (kèm test): verdict kiểm duyệt giữ nguyên khi cộng tác viên sửa bộ public; grant đích danh hết hiệu lực khi không còn chung lớp với chủ; continuation AI aux gắn với các thẻ còn lại; bộ chia sẻ vào lớp chỉ vào hàng ôn tập chung khi đã học; editor viết bài không bị dựng lại khi GV đổi cài đặt / đổi nhãn; không còn poll thừa; trang viết bài có `<main id="main">` và lề.

Còn để lại (cân nhắc sau):

| Mức    | Vấn đề                                                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM | Người xem qua link (public/unlisted, không cùng lớp) gửi được đề xuất; `accepts_contributions` mặc định true nên vài tài khoản có thể lấp đầy hàng chờ 20/bộ; `note`/nội dung đề xuất không qua kiểm duyệt; đề xuất của tác giả bị ban vẫn hiện. Cân nhắc giới hạn đề xuất cho người xem qua lớp/được giao. |
| LOW    | Học sinh nhận danh sách thành viên đầy đủ qua `GET writing/sessions/:id` (dùng để tô màu), khác `getClass` chỉ cho thấy giáo viên.                                                                                                                                                                          |
| LOW    | `baseUpdatedAt` là tuỳ chọn ở `PUT /sets/:id`; duyệt đề xuất `stale` ghi đè thay đổi mới hơn (UI chỉ cảnh báo).                                                                                                                                                                                             |
| LOW    | `GET writing/docs/:id` (tới ~680 KB), ảnh, danh sách thư viện/đề xuất chưa có rate limit riêng.                                                                                                                                                                                                             |
| LOW    | Chưa đo CPU của update Yjs 256 KB dạng chèn đồng thời (bị rollback, chỉ tốn CPU).                                                                                                                                                                                                                           |
| LOW    | Token provider của batch AI aux trả output hỏng không cộng vào trần ngày.                                                                                                                                                                                                                                   |
| LOW    | Migration 0016 tạo index không `CONCURRENTLY`.                                                                                                                                                                                                                                                              |
