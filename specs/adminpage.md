# Khu quản trị `/admin`

**Trạng thái:** ✅ hoàn tất Bước 0–5 và mọi tiêu chí nghiệm thu (2026-10-06 14:03 +07) trên `feat/admin-console`; chưa push/PR.
**Nhánh:** `feat/admin-console` (tách từ `main` sau khi PR #4 AI chạy nền đã merge)
**Phụ thuộc:** Phase 5 (kiểm duyệt, báo cáo, audit log), Phase 3 (job AI, credit)
**Kết quả:** khu quản trị riêng có layout và menu con, quản lý người dùng, AI & credit, bộ thẻ, kiểm duyệt, có trang tổng quan và nhật ký thao tác.

## Hiện trạng

- `/admin` là trang tổng quan, dùng chung layout kiểm tra quyền DB và menu 6 mục. Trang kiểm duyệt cũ chuyển sang `/admin/moderation`; component nằm trong `src/features/admin/`.
- Đã có người dùng (danh sách và chi tiết), AI & credit, bộ thẻ và nhật ký. Bộ lọc/cursor lưu trên URL; bảng chuyển sang danh sách thẻ trên màn hình nhỏ.
- Có sẵn để tận dụng:
  - `isAdmin` / `requireAdmin` (`src/server/services/access.ts`), kiểm tra quyền qua DB. Trang trả `notFound()` nếu không phải admin.
  - Router `/api/v1/admin/*` trong `src/server/admin-api.ts`, các hàm `applySetAction` (approve/reject/hide/restore), `setBanned`, `audit()`.
  - Các bảng `auditLogs`, `creditLedger` (`unique(userId, reason, ref)`), `aiJobs` (status, tokens, credits). Extension `pg_trgm` đã bật ở migration 0010.
- Cấp quyền admin đầu tiên bằng `pnpm admin:grant <email>`; admin hiện có có thể cấp/thu quyền qua UI với xác nhận hai bước khi cấp.

## Phạm vi

| Route               | Nội dung                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/admin`            | Tổng quan: user mới (7 ngày), số bộ thẻ public, job AI hôm nay/lỗi, token Groq đã dùng so với `AI_GLOBAL_DAILY_TOKENS`, số báo cáo đang mở |
| `/admin/moderation` | Báo cáo + Hàng chờ duyệt hiện có, chuyển sang đây và giữ nguyên chức năng                                                                  |
| `/admin/users`      | Tìm theo email/tên/username, phân trang. Trang chi tiết có credit, job AI gần đây, các bộ thẻ, khóa/mở khóa, cấp/thu quyền admin           |
| `/admin/ai`         | Job AI đang chạy hoặc lỗi gần đây (lọc theo status), hủy job treo. Cộng/trừ credit thủ công                                                |
| `/admin/sets`       | Tìm mọi bộ thẻ public, lọc theo `moderationStatus`, ẩn/khôi phục, xem lịch sử kiểm duyệt từ audit log                                      |
| `/admin/audit`      | Nhật ký thao tác admin, lọc theo action/actor/target, phân trang                                                                           |

**Không cần migration bắt buộc.** Có thể thêm một index `audit_logs(created_at)` cho trang nhật ký. `auditLogs.targetType` là varchar(8), thêm giá trị `"job"` không cần đổi schema.

## Thứ tự triển khai

### Bước 0: Nhánh

- [x] Tạo nhánh `feat/admin-console`.

### Bước 1: Server

- [x] Tách khối `domain === "admin"` từ `community-api.ts` sang `src/server/admin-api.ts`, giữ nguyên URL.
- [x] `src/server/services/admin/overview.ts`: mỗi chỉ số một query tổng hợp, chạy song song bằng `Promise.all`, tái dùng `globalTokensToday`.
- [x] `src/server/services/admin/users.ts`:
  - `listUsers({ q, cursor })`: tìm bằng `ilike`/trgm, giới hạn 50, phân trang theo cursor.
  - `getUserDetail(id)`: dùng `creditStatus`.
  - `setRole(adminId, id, role)`: **chặn tự thu quyền của chính mình và chặn thu quyền admin cuối cùng**.
- [x] `src/server/services/admin/credits.ts`: `adjustCredits(adminId, userId, delta, note)`.
  - Chạy trong transaction có `lockUser`.
  - Ghi ledger với `reason: "admin_adjust"`, `ref` là id audit, đồng thời ghi audit.
  - Giới hạn `|delta| ≤ 1000`, không cho số dư âm.
- [x] `src/server/services/admin/jobs.ts`: `listJobs({ status, cursor })`, `cancelJob(adminId, jobId)` tái dùng đường hủy/hoàn credit hiện có, tôn trọng `stepLease`.
- [x] `src/server/services/admin/sets.ts`: `listSets({ q, status, cursor })`, `setHistory(setId)` lấy từ audit.
- [x] `src/server/services/admin/audit.ts`: `listAudit({ action, actorId, targetId, cursor })`.
- [x] Validate mọi input bằng Zod. Mọi thao tác ghi đều gọi `audit()` và qua rate limit `enforceLimit("admin:<id>")`.

#### Ghi chú Bước 1 (đã làm)

- Endpoint (đều nằm sau `requireAdmin`; mọi request ghi có rate limit 300 lần/giờ/admin):
  - `GET admin/overview`, `GET admin/audit`
  - `GET admin/users`, `GET admin/users/:id`, `POST admin/users/:id/ban|unban`, `PATCH admin/users/:id/role`, `POST admin/users/:id/credits`
  - `GET admin/jobs`, `POST admin/jobs/:id/cancel`
  - `GET admin/sets`, `GET admin/sets/:id/history`, `POST admin/sets/:id/approve|reject|hide|restore`
  - Giữ nguyên: `GET admin/reports`, `POST admin/reports/:id/resolve`, `GET admin/moderation`
- Danh sách phân trang theo keyset trên id (UUID v7): trả `{ items, nextCursor }`, 50 dòng/trang.
- "Admin cuối cùng": chặn tự đổi quyền; dùng advisory transaction lock chung cho thay đổi quyền/khóa tài khoản, kiểm tra lại quyền actor trong transaction và đếm admin trước khi thu quyền. Hai admin không thể đồng thời thu quyền hoặc khóa nhau thành công. Không cấp quyền cho tài khoản bị khóa/đã xóa.
- Credit: ledger `reason: "admin_adjust"`, không cho số dư âm, không tự điều chỉnh cho chính mình, `|delta| ≤ 1000`, bắt buộc ghi chú.
- Hủy job: tách `stopJob` ra từ `cancelJob` trong `src/server/ai/jobs.ts`. Chủ job vẫn bị tính credit cho phần việc đã làm, như khi tự hủy.
- Không cần migration: id v7 đã đủ để sắp xếp, nên không thêm index `audit_logs(created_at)`.
- Test: `src/server/services/admin/schemas.test.ts` (9 unit), `src/features/admin/lib/filters.test.ts` (3 unit) và `tests/integration/admin.test.ts` (17 integration). Matrix API bao phủ member/admin bị khóa/admin đã xóa cho mọi route đọc và ghi.

### Bước 2: Layout `/admin`

- [x] `src/app/(app)/admin/layout.tsx`: kiểm tra `isAdmin` một lần cho cả khu (trả `notFound()`), có menu con `<nav aria-label>` và đánh dấu mục đang mở.
- [x] Mỗi route con là một `page.tsx` mỏng, render component trong `src/features/admin/` (feature mới). Chuyển `AdminPanel` từ `community` sang đây.

### Bước 3: UI

- [x] Component dùng chung:
  - `AdminTable`: bảng responsive, ở 320px chuyển thành danh sách thẻ.
  - `SearchFilters`: lưu bộ lọc, tìm kiếm và cursor **trên URL**.
  - `ConfirmDialog` (radix) cho thao tác nguy hiểm: khóa tài khoản, thu quyền admin, trừ credit, hủy job.
- [x] Các trang: Tổng quan, Kiểm duyệt, Người dùng (danh sách + chi tiết), AI & credit, Bộ thẻ, Nhật ký.
- [x] Dữ liệu tải qua TanStack Query, invalidate sau mutation, báo kết quả bằng toast.
- [x] i18n `messages/{vi,en,zh}.json` dưới namespace mới `admin.*`, chuyển các khóa `community.admin.*` sang.
- [x] `UserMenu`: đổi link "Kiểm duyệt" thành "Quản trị".

### Bước 4: Kiểm thử

- [x] Unit (Vitest): validate input, giới hạn delta credit, parse bộ lọc trên URL. Guard "admin cuối cùng" và thao tác đồng thời được kiểm tra bằng integration với DB thật.
- [x] Integration (DB `_test`):
  - Mọi endpoint admin trả 403 với user thường và user bị khóa.
  - `adjustCredits` cộng đúng vào `creditStatus`.
  - `cancelJob` hoàn credit đúng.
  - Mỗi thao tác ghi đúng một dòng audit.
- [x] E2E (`E2E_PORT=3200`):
  - Admin đi qua 6 trang, khóa rồi mở khóa user, cộng credit.
  - User thường vào `/admin` nhận 404.
  - Kiểm tra axe, không tràn ngang ở 320/768/1440, cả theme sáng và tối.

### Bước 5: Review

- [x] Chạy agent code-reviewer và security-reviewer (liên quan auth/role).
- [x] Cập nhật `specs/state.md`.

## Tiến độ kiểm tra và bàn giao (2026-10-06)

- Đã triển khai toàn bộ layout/UI trong `src/features/admin/`, TanStack Query, toast, bộ lọc URL và namespace `admin.*` đủ vi/en/zh. Tổng quan/job tự cập nhật mỗi 15 giây.
- Lint: 0 lỗi, 2 cảnh báo có sẵn ngoài phần admin. Typecheck, kiểm tra định dạng các file thay đổi và production build pass. Unit toàn dự án: **456/456 pass**.
- Integration toàn dự án: **168/168 pass** trước khi thêm test đồng thời khóa admin cuối cùng; test mới được xác nhận riêng trong suite admin (17 test).
- E2E admin: luồng 6 trang, member bị chặn, khóa/mở khóa, cấp/thu quyền hai bước, cộng/trừ credit và kiểm tra audit đã pass. Axe WCAG 2.1 AA + không tràn ngang ở **320/768/1440**, **sáng/tối**, gồm trang chi tiết user, đã pass.
- E2E bổ sung hủy job, ẩn/khôi phục bộ thẻ, xem history và đổi ngôn ngữ zh/en đã pass trong lượt hồi quy toàn dự án.
- **Hồi quy E2E toàn dự án (14:03): 44 pass, 2 skip** (hai test gọi Groq live, bỏ qua theo cấu hình; chưa kiểm tra live). Hai lỗi auth đăng xuất và thư mục ở lượt trước là do tải, không tái hiện: pass khi chạy riêng và cả ở lượt toàn bộ.
- Đã sửa race trong test E2E hủy job của admin (`tests/e2e/admin.spec.ts`), code server không đổi:
  - Job được chèn dưới tên chính admin, nên trình duyệt của admin tự chạy tiếp nó (tính năng chạy nền) và đẩy sang `validating`. Nay job thuộc về một user khác, đúng tình huống thật.
  - `toHaveCount(0)` của bảng pass ngay khi dialog xác nhận mở (Radix đặt `aria-hidden` cho phần còn lại của trang). Nay test chờ toast "Đã xử lý." rồi mới đọc API.
  - Dòng bộ thẻ được xác định bằng link chủ sở hữu, vì DB E2E giữ bộ thẻ trùng tên từ các lượt trước. Đã chạy `--repeat-each=3`: 9/9 pass.
- Lượt kiểm tra cuối: typecheck sạch, lint 0 lỗi (2 cảnh báo có sẵn), unit **456/456**, integration **169/169** (coverage dòng 88,65%), build pass, Prettier sạch.
- Việc tiếp theo: push nhánh và tạo PR vào `main` khi người dùng đồng ý. Không có migration.

## Rủi ro

| Mức    | Rủi ro                               | Cách xử lý                                                                                                                                     |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH   | Leo thang quyền                      | Mọi endpoint qua `requireAdmin` (kiểm tra DB), guard đặt ở đầu router chung, có test 403 cho từng route. Cấp quyền admin cần xác nhận hai bước |
| MEDIUM | Sai credit khi điều chỉnh thủ công   | Transaction có `lockUser` để không đua với `reserveCredits`/`chargeJob`                                                                        |
| MEDIUM | Hủy job đang chạy một bước           | Tôn trọng `stepLease`, không ghi đè kết quả của bước đang chạy                                                                                 |
| LOW    | Query trang tổng quan chậm trên Neon | Mọi truy vấn đều có giới hạn hoặc index, không quét toàn bảng mà không lọc theo thời gian                                                      |

## Tiêu chí nghiệm thu

- [x] 6 trang `/admin/*` hoạt động, có menu con, dùng được ở 320px, đạt axe WCAG 2.1 AA.
- [x] User thường hoặc bị khóa không truy cập được trang lẫn API admin (UI `notFound()` khi có session không đủ quyền; session đã bị thu hồi chuyển về đăng nhập; API 403 hoặc 401 nếu hết session).
- [x] Không thể thu quyền admin của chính mình hoặc của admin cuối cùng.
- [x] Mọi thao tác ghi của admin đều có dòng trong audit log và hiện ở `/admin/audit`.
- [x] Credit điều chỉnh thủ công hiện đúng trong số dư của user.
- [x] Đủ 3 ngôn ngữ vi/en/zh.
- [x] Lint, typecheck, unit, integration, E2E đều pass.

## Độ phức tạp: TRUNG BÌNH–CAO

- Server: khoảng 6 service và router, chủ yếu tái dùng logic có sẵn.
- UI: 6 trang và 3 component dùng chung, 3 ngôn ngữ.
- Không có migration bắt buộc, deploy không cần chạy gì trên Neon trước.
