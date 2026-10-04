# Phase 2 — Backend, tài khoản thật và đồng bộ dữ liệu

**Trạng thái:** hoàn tất triển khai và nghiệm thu local HTTP (2026-10-04). Google OAuth đã nối cấu hình; nghiệm thu với Google thật còn chờ credentials. Production Resend/Upstash và CI trên GitHub chưa có tài khoản/repo để xác nhận.
**Phụ thuộc:** Phase 1 hoàn tất
**Kết quả:** dữ liệu lưu trên Postgres, đăng nhập thật (email/mật khẩu + Google), có xác minh email và đặt lại mật khẩu. Dữ liệu mock ở localStorage nhập được vào tài khoản. UI giữ nguyên.

## Mục tiêu

1. Thay toàn bộ `local*Repository` bằng `http*Repository` gọi `/api/v1`, không đổi component.
2. Có auth an toàn: phiên dùng cookie HttpOnly, có xác minh email, quên mật khẩu, đăng nhập Google.
3. Dựng nền móng server (DB, migration, service, rate limit, env) cho Phase 3–6.
4. Bắt đầu CI: lint, typecheck, unit, integration, build chạy trên mỗi PR.

## Quyết định kỹ thuật (đề xuất, chốt lại khi bắt đầu phase)

| Hạng mục        | Lựa chọn                                                                  | Lý do                                                                                               |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CSDL            | PostgreSQL (Neon cho môi trường chạy thật, Docker khi chạy local và test) | Quan hệ rõ (bộ thẻ – thẻ – tiến độ), full-text search ở P5                                          |
| ORM / migration | Drizzle ORM + drizzle-kit                                                 | Kiểu TypeScript sinh từ schema, migration bằng SQL thuần, nhẹ                                       |
| Auth            | Better Auth (chạy ngay trong Next.js, adapter Drizzle)                    | Hỗ trợ email/mật khẩu, xác minh email, reset, OAuth Google, quản lý session, không phụ thuộc vendor |
| Email           | Resend + React Email                                                      | Mẫu email đa ngôn ngữ, dễ dùng                                                                      |
| Rate limit      | Upstash Redis (`@upstash/ratelimit`)                                      | Hoạt động trên serverless và edge                                                                   |
| API             | Route Handler `/api/v1/*`                                                 | Khớp với repository HTTP, dễ test tích hợp                                                          |

## Phạm vi

**Trong phạm vi**

- Schema DB và migration cho `users` (Better Auth: `user`, `session`, `account`, `verification`), `study_sets`, `cards`, `card_progress`, `test_results`, `game_scores`.
- API CRUD bộ thẻ, tiến độ, kết quả kiểm tra, điểm game, hồ sơ người dùng.
- Các trang mới: `/verify-email`, `/reset-password`. Trang `/forgot-password` gửi email thật.
- Nút Google hoạt động thật, Apple vẫn ẩn.
- Luồng nhập dữ liệu localStorage cũ vào tài khoản.
- Trang Cài đặt: đổi tên, đổi mật khẩu, đổi email (có xác minh), xóa tài khoản (xóa mềm, dọn hẳn sau 30 ngày).

**Ngoài phạm vi:** AI thật (P3), FSRS (P4), bộ thẻ công khai (P5).

## Schema CSDL (Drizzle)

```
study_sets   id uuid pk, owner_id fk→user on delete cascade, title varchar(120), description text,
             term_lang varchar(8), definition_lang varchar(8), source enum(manual|ai|import),
             card_count int, created_at, updated_at, deleted_at null
             index (owner_id, updated_at desc)
cards        id uuid pk, set_id fk→study_sets cascade, position int, term text, definition text,
             phonetic text null, created_at, updated_at
             unique (set_id, position) deferrable
card_progress user_id fk, card_id fk cascade, set_id fk cascade, status enum(new|learning|known), updated_at
             pk (user_id, card_id), index (user_id, set_id)
test_results id uuid pk, user_id fk, set_id fk cascade, config jsonb, score int, total int, duration_ms int, taken_at
             index (user_id, set_id, taken_at desc)
game_scores  id uuid pk, user_id fk, set_id fk cascade, game enum(match|gravity|memory|scramble),
             score int, time_ms int, played_at
             index (set_id, game, time_ms) — dùng cho bảng xếp hạng ở P5
```

Giới hạn dữ liệu: `term` và `definition` tối đa 1000 ký tự, tối đa 500 thẻ mỗi bộ, tối đa 1000 bộ mỗi người dùng.

## API

| Method     | Đường dẫn                                 | Mô tả                                                          |
| ---------- | ----------------------------------------- | -------------------------------------------------------------- |
| `*`        | `/api/auth/[...all]`                      | Handler của Better Auth                                        |
| GET        | `/api/v1/me`                              | Hồ sơ người dùng hiện tại                                      |
| PATCH      | `/api/v1/me`                              | Cập nhật `displayName`, `uiLocale`, `avatarColor`              |
| DELETE     | `/api/v1/me`                              | Yêu cầu xóa tài khoản                                          |
| GET        | `/api/v1/sets?cursor&limit&q&sort&source` | Danh sách bộ thẻ của tôi                                       |
| POST       | `/api/v1/sets`                            | Tạo bộ thẻ (kèm danh sách thẻ)                                 |
| GET        | `/api/v1/sets/:id`                        | Chi tiết bộ thẻ kèm thẻ                                        |
| PUT        | `/api/v1/sets/:id`                        | Ghi đè toàn bộ bộ thẻ, thẻ kèm theo                            |
| DELETE     | `/api/v1/sets/:id`                        | Xóa mềm                                                        |
| POST       | `/api/v1/sets/:id/duplicate`              | Nhân bản                                                       |
| GET / PUT  | `/api/v1/sets/:id/progress`               | Đọc / ghi tiến độ theo lô                                      |
| DELETE     | `/api/v1/sets/:id/progress`               | Đặt lại tiến độ                                                |
| GET / POST | `/api/v1/sets/:id/test-results`           | Lịch sử / lưu kết quả kiểm tra                                 |
| PATCH      | `/api/v1/test-results/:id`                | Cập nhật điểm khi người dùng tự chấm lại                       |
| GET / POST | `/api/v1/sets/:id/game-scores?game=`      | Kỷ lục cá nhân / lưu điểm                                      |
| POST       | `/api/v1/sets/:id/activity`               | Ghi lần học gần nhất                                           |
| GET        | `/api/v1/activity?limit=`                 | Các bộ học gần đây, tối đa 50                                  |
| POST       | `/api/v1/import/local`                    | Nhập dữ liệu từ localStorage (giới hạn kích thước payload 2MB) |

- Mọi endpoint đều xác thực qua session, validate bằng schema zod dùng chung từ `features/*/schemas.ts`, lọc theo `owner_id`, và trả envelope thống nhất (xem [architecture.md](architecture.md)).
- `PUT /sets/:id` chạy trong transaction: diff thẻ theo `id` để giữ nguyên `card_progress` của thẻ không đổi.
- `PUT /sets/:id/progress` nhận `{ cards: [{ cardId, status }] }`, trả mảng các bản ghi đã lưu. Endpoint xóa/đặt lại/ghi activity trả `{ success: true, data: null }`.
- Danh sách bộ thẻ, lịch sử test/game dùng `meta.nextCursor` như [architecture.md](architecture.md). Bản client hiện tại đọc tối đa 20 trang bộ thẻ (1000 bộ), 200 trang lịch sử; vượt giới hạn thì báo lỗi thay vì trả kết quả thiếu. Server cần thiết kế kỷ lục/aggregate riêng trước khi vượt giới hạn lịch sử này.

## Phía client

- Thêm `http*Repository` cho từng domain. `DataProvider` chọn cài đặt theo `NEXT_PUBLIC_DATA_SOURCE=local|http`.
- Thay `AuthGuard` client bằng kiểm tra session ở server (`proxy.ts` của Next 16 và kiểm tra trong layout). Trang được bảo vệ render từ server, không bị nháy nội dung.
- Optimistic update cho đổi trạng thái thẻ và sắp xếp lại. Lỗi thì rollback và hiện toast.
- **Nhập dữ liệu cũ:** lần đầu đăng nhập, nếu còn key `siroquizz:v1:*` thì hiện banner “Nhập N bộ thẻ từ thiết bị này”. Nhập xong thì xóa key local.

## Bảo mật

- Mật khẩu băm bằng scrypt/argon2 (mặc định của Better Auth). Tối thiểu 8 ký tự và kiểm tra trong danh sách mật khẩu phổ biến.
- Rate limit:
  - Đăng nhập: 5 lần/phút cho mỗi cặp IP + email.
  - Đăng ký: 3 lần/giờ cho mỗi IP.
  - Quên mật khẩu: 3 lần/giờ cho mỗi email.
  - Endpoint ghi: 60 lần/phút cho mỗi người dùng.
- Cookie `HttpOnly; Secure; SameSite=Lax`. Endpoint ghi kiểm tra `Origin`.
- Phản hồi đăng nhập và quên mật khẩu không cho biết email có tồn tại hay không.
- Không trả stack trace ra client. Log có `requestId` ở server.
- Bộ thẻ của người khác trả 404.
- Chạy agent `security-reviewer` cho toàn bộ auth và API trước khi merge.

## Kế thừa từ review Phase 1

Những điểm chủ động để lại cho Phase 2 (xem [state.md](state.md)):

- **Lọc dữ liệu hỏng:** storage local bỏ qua bản ghi hỏng và lần ghi sau làm mất hẳn (review #12). DB với migration có kiểm soát sẽ thay thế, không cần sửa bản local.
- **Phân quyền tiến độ học:** progress/test/game phải kiểm tra quyền sở hữu bộ thẻ ở server. Xóa bộ thẻ thì cascade qua FK.
- **Mật khẩu:** mutation login/register đã đặt `gcTime: 0`. Khi chuyển sang API, không log body của các request này.
- **Phiên hết hạn:** `UNAUTHENTICATED` đã được xử lý toàn cục trong `data-provider.tsx`, giữ nguyên cơ chế này khi đổi sang HTTP.
- **Kiểm tra file upload:** `validateFiles` dùng `Map` để chặn prototype key. Server vẫn phải kiểm tra magic bytes (Phase 3).

## Thứ tự triển khai

- [x] 1. Docker Compose có Postgres. Thêm `server/env.ts` validate biến môi trường bằng zod, thêm `.env.example`.
- [x] 2. Schema Drizzle, migration đầu tiên, script seed bộ mẫu.
- [x] 3. Better Auth: email/mật khẩu, session, các trang verify và reset, email gửi qua Resend (3 ngôn ngữ).
- [x] 4. Service và Route Handler cho bộ thẻ, viết test tích hợp trước.
- [x] 5. Progress, test results, game scores.
- [x] 6. `http*Repository`, chuyển `DataProvider` sang chế độ `http`, bảo vệ route ở server.
- [x] 7. Luồng nhập dữ liệu localStorage.
- [x] 8. Cài đặt tài khoản (đổi mật khẩu, đổi email, xóa tài khoản).
- [x] 9. Đăng nhập Google.
- [x] 10. Rate limit, review bảo mật, GitHub Actions CI.

### Quyết định và kiểm tra thực tế (2026-10-04)

- Postgres 17 ở cổng 5433 local; migrations Drizzle và unique position deferrable, UUIDv7, seed theo locale một lần, dọn tombstone sau 30 ngày.
- Better Auth 1.7.7: scrypt, session DB, email verification/reset, revoke sessions, Google linking chỉ trusted provider. Email text đa ngôn ngữ qua Resend hoặc Mailpit SMTP local; không cần React Email cho template hiện tại.
- HTTP repositories/auth, server guard trong layouts + proxy, CRUD/progress/history, idempotent import, security settings đều hoạt động. API có owner checks, origin checks, no-store, bounded JSON, requestId, Redis/local rate limiter. Sort API dùng cursor riêng theo thứ tự.
- Xóa bộ thẻ giữ tombstone và xóa cards/progress/test/game/activity trong cùng transaction. Xóa OAuth-only account cần session mới trong 5 phút; credential account cần password confirmation.
- Review bảo mật trực tiếp đã kiểm tra IDOR, origin, IP header production, payload bound, duplicate IDs, transaction rollback và deletion. Không chạy subagent security-reviewer trong phiên này; không tuyên bố có review độc lập.
- CI đã cấu hình Postgres/Mailpit, HTTP mode và integration coverage; chưa chạy GitHub vì workspace không có Git repository.
- 341 unit/component tests (96.51% lines), 18 integration tests (94.23% lines, 81.85% branches). Full browser suite: cập nhật kết quả cuối trong state. Lint/typecheck/build webpack pass.
- Integration dùng DB riêng có hậu tố `_test`, truncate trước từng test thay vì transaction rollback bao ngoài (services tự mở transaction).
- Giới hạn bên ngoài: chưa có Google OAuth credentials để nghiệm thu live, chưa xác thực email domain Resend/Upstash production. Không đánh dấu những kiểm tra live là pass.

## Tiêu chí nghiệm thu

- [x] Đăng ký → nhận email → xác minh → đăng nhập được trên 2 trình duyệt, dữ liệu đồng bộ giữa hai bên.
- [x] Quên mật khẩu → email → đặt lại thành công. Link cũ hết hạn sau 1 giờ và chỉ dùng được 1 lần.
- [ ] **Chờ credentials live:** Đăng nhập Google tạo tài khoản mới, hoặc liên kết với tài khoản cùng email đã xác minh.
- [x] Người dùng A không đọc, sửa hay xóa được bộ thẻ của B (test tích hợp xác nhận).
- [x] Toàn bộ E2E của Phase 1 vẫn pass khi chạy ở chế độ `http`.
- [x] Nhập dữ liệu từ localStorage giữ đủ bộ thẻ, thẻ và tiến độ.
- [x] Vượt rate limit thì nhận 429 và UI hiện thông báo dễ hiểu.

## Kiểm thử

- Integration: service và route chạy trên Postgres test, mỗi test dùng transaction rồi rollback. Bao phủ các ca phân quyền, validate và rate limit.
- E2E: đăng ký có email (bắt email bằng Mailpit local), reset mật khẩu, đồng bộ 2 phiên, nhập dữ liệu localStorage.
- CI: lint → typecheck → unit → integration (Postgres service) → build → E2E (Chromium).

## Rủi ro

| Rủi ro                         | Giảm thiểu                                                      |
| ------------------------------ | --------------------------------------------------------------- |
| Lệch dữ liệu khi PUT cả bộ thẻ | Diff theo id trong transaction, có test các ca thêm/xóa/sắp xếp |
| Email vào spam                 | Cấu hình SPF/DKIM/DMARC cho domain gửi                          |
| Better Auth đổi API            | Khóa phiên bản, bọc lại trong `server/auth.ts`                  |
