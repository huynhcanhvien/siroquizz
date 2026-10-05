# Kế hoạch: Nhóm học (Teams)

**Trạng thái:** chờ người dùng duyệt, chưa viết code
**Lập lúc:** 2026-10-05 14:57 +07
**Thay thế:** `specs/phase-5-community.md` §5 “Lớp học”. Khi làm xong, cập nhật spec đó để trỏ sang Nhóm, tránh có 2 khái niệm song song.
**Chế độ dữ liệu:** chỉ chạy ở `NEXT_PUBLIC_DATA_SOURCE=http`. Ở chế độ mock localStorage thì ẩn menu Nhóm.

## 1. Yêu cầu (đã chốt với người dùng)

| # | Quyết định |
|---|---|
| Tạo nhóm | Ai cũng tạo được nhóm và là **chủ nhóm** (owner). |
| Mời | **Link/mã tham gia** (khóa được đăng ký, tạo mã mới được) **và** mời qua **email**. Người được mời thấy lời mời trong app rồi bấm chấp nhận hoặc từ chối. |
| Bộ thẻ | Một nhóm có **nhiều bộ thẻ**. Thành viên học bộ gốc ở chế độ **chỉ đọc**, tiến độ của ai người nấy giữ. Chủ bộ sửa thẻ thì cả nhóm thấy ngay. |
| Hạn chót | Mỗi bộ trong nhóm có **hạn chót tùy chọn**. |
| Quyền | Chủ nhóm cấp **Toàn quyền** hoặc **chọn từng quyền** trong menu. |
| Người được cấp quyền | Có thể là **người ngoài** không học (vai trò `manager`, ví dụ trợ giảng, phụ huynh), hoặc là thành viên đang học. |
| Riêng tư | Thành viên thường **chỉ thấy tiến độ của mình**, cùng tên nhóm, các bộ thẻ, hạn chót và số thành viên. |
| Số liệu cho người có quyền xem | % đã thuộc theo bộ, thời gian học và hoạt động, điểm kiểm tra và trò chơi, các thẻ cả nhóm hay sai. |
| Rời nhóm hoặc bị xóa | Mất quyền học bộ của nhóm. **Lịch sử vẫn giữ** trong thống kê cá nhân. Vào lại nhóm thì tiến độ cũ quay lại. Trước khi rời có nút “Sao chép về thư viện”. |
| Thống kê cá nhân | Thành viên thấy tiến độ của mình với các bộ của nhóm ngay trong trang `/stats`. |

### Vai trò và quyền

- `owner`: có mọi quyền. Chỉ owner được **cấp/thu quyền**, **xóa nhóm** và **chuyển quyền sở hữu**. Owner không rời được nhóm, phải chuyển quyền hoặc xóa nhóm trước.
- `member`: người học. Có trong bảng tiến độ. Có thể được cấp thêm quyền.
- `manager`: không học và không có trong bảng tiến độ. Chỉ có các quyền được cấp. Vẫn xem được thẻ của bộ.

Các quyền chọn được (`team_permission`):

| Quyền | Cho phép |
|---|---|
| `view_stats` | Xem bảng tiến độ, chi tiết từng thành viên, thẻ hay sai |
| `invite` | Gửi lời mời email, xem và sao chép link/mã |
| `remove_members` | Xóa thành viên (không xóa được owner hay người khác có quyền này) |
| `manage_sets` | Gắn hoặc gỡ bộ thẻ, đặt hạn chót. Chỉ gắn được bộ **của chính mình** |
| `edit_team` | Đổi tên/mô tả, khóa đăng ký, tạo mã mới |

“Toàn quyền” nghĩa là có đủ 5 quyền trên. Quyền cấp/thu quyền **không** cấp được cho ai, để tránh leo thang đặc quyền.

## 2. Hiện trạng code liên quan

- Mọi truy cập bộ thẻ đều chỉ cho chủ sở hữu, qua `requireOwnedSet` (`src/server/services/sets.ts:29`). Hàm này được gọi ở `progress.ts`, `learning.ts` (`requireCard`, `reviewInTransaction`, stars, sessions), và gián tiếp ở route ảnh `src/app/api/v1/images/[id]/route.ts`. `dueCards` (`learning.ts:179`) lọc `studySets.ownerId = userId`.
- **Tiến độ đã lưu theo `userId`**: `card_progress`, `review_logs`, `study_sessions`, `test_results`, `game_scores`. Thành viên học bộ của người khác sẽ tự có tiến độ riêng mà không cần đổi schema tiến độ.
- `stats.ts` chỉ lọc `userId` và `studySets.deletedAt`, không lọc owner. Nhờ vậy thống kê cá nhân **tự tính** cả bộ của nhóm, kể cả sau khi rời nhóm (đúng yêu cầu “giữ lịch sử”).
- `updateSet` giữ nguyên `card.id` khi sửa, nên chủ bộ sửa thẻ không làm mất tiến độ của thành viên. Riêng thẻ bị xóa sẽ cascade xóa tiến độ của thẻ đó. Chấp nhận được.
- API nằm trong router catch-all `src/app/api/v1/[...path]/route.ts`, phần học tập tách ra ở `src/server/learning-api.ts`. Theo cùng mẫu, thêm `src/server/teams-api.ts`.
- `sendAccountEmail` trong `src/server/email.ts` chạy được ở local (Mailpit). Resend production chưa có credentials, nên lời mời trong app là kênh chính, còn email chỉ là kênh phụ (best-effort).
- Thư mục `drizzle/` đang có `0007_wide_sprite.sql` chưa commit (công việc AI step-lease ở phiên khác). Migration của Nhóm dùng **số kế tiếp ở thời điểm làm**, sinh bằng `pnpm db:generate`.

## 3. Schema mới (1 migration, chỉ thêm bảng)

```
team_role        enum(owner|member|manager)
team_permission  enum(view_stats|invite|remove_members|manage_sets|edit_team)
invite_status    enum(pending|accepted|declined|revoked)

teams         id uuid v7 pk, owner_id → user (cascade), name varchar(80), description text default '',
              join_code varchar(8) unique, join_locked bool default false, deleted_at null, created_at, updated_at
              index (owner_id)
team_members  team_id → teams (cascade), user_id → user (cascade), role team_role,
              permissions team_permission[] default '{}', joined_at
              pk (team_id, user_id); index (user_id)
team_sets     team_id → teams (cascade), set_id → study_sets (cascade), added_by → user,
              due_at timestamptz null, added_at
              pk (team_id, set_id); index (set_id)
team_invites  id uuid v7 pk, team_id → teams (cascade), email varchar(254) (lowercase),
              role team_role check <> owner, permissions team_permission[], invited_by → user,
              status invite_status, created_at, expires_at (+14 ngày), responded_at null
              unique (team_id, email) where status = 'pending'; index (email, status)
```

- Mã tham gia gồm 8 ký tự lấy từ bảng chữ dễ đọc (bỏ 0/O/1/I), sinh bằng `crypto`. Tạo mã mới thì link cũ hết hiệu lực.
- Giới hạn (đặt trong `src/features/teams/limits.ts`): tối đa **10 nhóm mỗi owner**, **100 thành viên**, **30 bộ thẻ mỗi nhóm**, **50 lời mời đang chờ mỗi nhóm**.

## 4. Lớp phân quyền: `src/server/services/access.ts`

Đây là nơi duy nhất quyết định quyền, đúng như `phase-5-community.md` yêu cầu.

```ts
canViewSet(db, userId, setId)      // owner bộ, HOẶC thành viên (member|manager|owner) của nhóm còn sống có gắn bộ đó
requireViewableSet(db, userId, setId, lock?)  // 404 nếu không có quyền (không lộ việc bộ có tồn tại)
requireOwnedSet(...)               // giữ nguyên, dùng cho sửa/xóa
viewableSetIds(db, userId)         // subquery dùng cho dueCards / thư viện
requireTeamRole(db, userId, teamId)            // 404 nếu không phải thành viên
requireTeamPermission(db, userId, teamId, perm) // 403 nếu thiếu quyền, owner luôn qua
```

Thay `requireOwnedSet` bằng `requireViewableSet` ở các đường **chỉ đọc bộ + ghi tiến độ của chính mình**: `getSet` (thêm biến thể đọc), `getProgress`, `putProgress`, `resetProgress`, `listHistory`, `saveTest`, `correctTest`, `saveGame`, `recordActivity`, `requireCard`, `reviewInTransaction`, `getStars`, `setStar`, `startSession`, `finishSession`, route ảnh. Các đường `updateSet` và `removeSet` **giữ** `requireOwnedSet`.

`dueCards` thay điều kiện owner bằng `set_id IN viewableSetIds`, để thẻ đến hạn của bộ nhóm vào hàng Ôn tập và tự biến mất khi rời nhóm.

`GET /sets/:id` trả thêm `access: { isOwner, teams: [{id, name, dueAt}] }` để UI ẩn nút Sửa/Xóa và hiện “Từ nhóm X”.

## 5. API (`src/server/teams-api.ts`, gắn vào router v1)

| Method & path | Quyền | Ghi chú |
|---|---|---|
| `GET /teams` | đã đăng nhập | Các nhóm tôi tham gia (kèm role, quyền) và lời mời đang chờ gửi tới email của tôi |
| `POST /teams` | đã đăng nhập | Tạo nhóm, người tạo thành owner |
| `GET /teams/:id` | thành viên | Thông tin, bộ thẻ + hạn chót, số thành viên, tiến độ **của tôi** trên từng bộ |
| `PATCH /teams/:id` | `edit_team` | Đổi tên/mô tả, khóa đăng ký |
| `POST /teams/:id/join-code` | `edit_team` | Tạo mã mới |
| `DELETE /teams/:id` | owner | Xóa mềm |
| `POST /teams/:id/transfer` | owner | Chuyển quyền sở hữu cho một thành viên (owner cũ thành `member` toàn quyền) |
| `GET /teams/:id/members` | `view_stats` hoặc `invite` hoặc `remove_members` | Thành viên thường không gọi được, đúng yêu cầu riêng tư |
| `PATCH /teams/:id/members/:userId` | owner | Đổi role member↔manager, cấp/thu quyền |
| `DELETE /teams/:id/members/:userId` | `remove_members` hoặc chính mình (rời nhóm) | Không xóa được owner |
| `POST /teams/:id/invites` | `invite` | Mời qua email. **Luôn trả 202** dù email có tài khoản hay chưa, để chống dò tài khoản. Người mời chỉ cấp được quyền mình đang có, owner cấp được mọi quyền |
| `GET /teams/:id/invites` · `DELETE /teams/:id/invites/:inviteId` | `invite` | Xem và thu hồi lời mời |
| `POST /invites/:inviteId/accept` · `/decline` | email đã xác minh khớp lời mời | Kiểm tra hết hạn và giới hạn thành viên |
| `GET /join/:code` · `POST /join/:code` | đã đăng nhập | Xem trước tên nhóm rồi tham gia làm `member`. Bị chặn khi `join_locked`. Rate limit theo user và IP |
| `PUT /teams/:id/sets/:setId` | `manage_sets` + là owner của bộ | Gắn bộ, đặt hoặc đổi `dueAt` |
| `DELETE /teams/:id/sets/:setId` | `manage_sets` | Gỡ bộ khỏi nhóm |
| `GET /teams/:id/stats?range=7\|30\|90` | `view_stats` | Xem §6 |
| `GET /teams/:id/members/:userId/stats` | `view_stats` | Chi tiết một thành viên |
| `GET /me/teams/progress` | đã đăng nhập | Dữ liệu cho mục “Nhóm của tôi” trong `/stats` và “Bài được giao” trên Home |

Mọi input kiểm tra bằng Zod, schema đặt ở `src/features/teams/schemas.ts` và dùng chung cho client lẫn server. Mã lỗi dùng `ApiError` có sẵn.

## 6. Thống kê nhóm (`src/server/services/team-stats.ts`)

Dữ liệu luôn lọc theo **(user_id ∈ thành viên role `member` hiện tại) × (set_id ∈ team_sets)**, nên không lộ hoạt động của thành viên trên bộ riêng của họ. Mỗi chỉ số là một truy vấn gom nhóm, không có N+1.

- **Bảng tiến độ** (thành viên × bộ): số thẻ mới, đang học, đã thuộc từ `card_progress`, tính % đã thuộc theo `cardCount`. Lần học cuối lấy từ `review_logs.reviewed_at` hoặc `study_activity.at`. Trạng thái theo hạn chót: `done` khi 100% đã thuộc, `on_track`, `overdue` khi quá `due_at` mà chưa done, `not_started`.
- **Thời gian và hoạt động**: tổng `active_seconds` từ `study_sessions` của bộ nhóm (phiên cũ không có cột này tính tối đa 10 phút, giống `stats.ts`), cho 7 và 30 ngày. Số ngày học có hoạt động trong khoảng chọn, hiển thị dạng sparkline hoặc heatmap nhỏ theo từng thành viên. *Lưu ý:* phiên Ôn tập gộp nhiều bộ có `set_id = null`, nên với các phiên đó thời gian lấy từ tổng `review_logs.duration_ms` của thẻ thuộc bộ nhóm. Hàm tính chung đặt trong `stats.ts` để hai nơi không lệch nhau.
- **Kiểm tra và trò chơi**: điểm gần nhất và cao nhất mỗi bộ từ `test_results`, độ chính xác ôn tập (rating > 1 / tổng) từ `review_logs`, kỷ lục trò chơi từ `game_scores`.
- **Thẻ hay sai**: top 15 thẻ theo số lần `rating = 1` (Again) trên tổng lượt ôn của cả nhóm trong khoảng chọn, kèm số người sai.
- Owner tự học thì cũng có tên trong bảng (owner đếm như một người học). `manager` thì không có tên.

## 7. Giao diện

Thư mục mới `src/features/teams/` gồm `components/`, `hooks.ts`, `http-repository.ts`, `schemas.ts` và `lib/`. Mọi chuỗi đưa vào `messages/{vi,en,zh}.json`.

- **SideNav**: thêm mục “Nhóm” (`src/components/layout/nav-items.ts`), có chấm báo khi có lời mời đang chờ.
- **`/teams`**: danh sách nhóm của tôi kèm vai trò, banner lời mời (Chấp nhận / Từ chối), nút Tạo nhóm (dialog).
- **`/teams/join/[code]`**: xem trước tên nhóm rồi bấm Tham gia. Nếu chưa đăng nhập thì chuyển sang login với `?next=` (dùng `safe-redirect`).
- **`/teams/[id]`**: các tab hiện hoặc ẩn theo quyền.
  - *Bộ thẻ* (ai cũng thấy): từng bộ có hạn chót, tiến độ của tôi và nút Học. Người có `manage_sets` thấy thêm nút Gắn bộ (chọn từ thư viện của mình) và nút đặt hoặc xóa hạn chót.
  - *Thống kê* (`view_stats`): bảng thành viên × bộ (sticky cột tên, chuyển sang danh sách thẻ trên điện thoại), các ô màu theo trạng thái hạn chót, mục thẻ hay sai, bộ lọc khoảng thời gian. Bấm vào thành viên thì mở trang chi tiết `/teams/[id]/members/[userId]`. Biểu đồ dùng lại `chart-kit.tsx`, `ColumnChart`, `ActivityHeatmap` để cùng hệ thống trực quan với `/stats`, kèm bảng thay thế cho trình đọc màn hình.
  - *Thành viên* (`invite`/`remove_members`/owner): danh sách, mời email, sao chép link/mã, menu quyền dạng checkbox kèm công tắc “Toàn quyền” (chỉ owner sửa được), đổi member↔manager, xóa thành viên, thu hồi lời mời.
  - *Cài đặt* (`edit_team`/owner): đổi tên, khóa đăng ký, tạo mã mới, chuyển quyền sở hữu, xóa nhóm.
  - Thành viên thường: có nút “Rời nhóm” và gợi ý “Sao chép bộ về thư viện” trước khi rời.
- **Trang bộ thẻ / học**: với bộ không phải của mình thì ẩn Sửa/Xóa, hiện huy hiệu “Từ nhóm X · hạn 20/10”, có nút “Sao chép về thư viện” (tạo bộ mới `source: import`, không chép tiến độ).
- **Thư viện**: thêm bộ lọc hoặc tab “Từ nhóm”.
- **Home**: mục “Bài được giao”, sắp theo hạn chót gần nhất, ẩn khi không có nhóm.
- **`/stats` cá nhân**: thêm khối “Nhóm của tôi”, mỗi nhóm có các bộ, % đã thuộc của tôi và trạng thái hạn chót. Phần streak, thời gian và heatmap hiện có đã tự tính hoạt động trên bộ nhóm.
- **Xóa bộ thẻ** đang gắn vào nhóm: hộp xác nhận cảnh báo “Bộ này đang được dùng trong N nhóm”.

## 8. Thứ tự triển khai

Làm trên nhánh mới `feat/teams` (xem câu hỏi mở 1). Theo TDD: viết test trước ở từng bước.

- [ ] **1. Schema + migration**: thêm enum và 4 bảng, `pnpm db:generate`, migrate DB local (truyền `DATABASE_URL` local tường minh, xem cảnh báo trong `specs/state.md`).
- [ ] **2. `access.ts` + refactor** (rủi ro cao nhất): viết integration test cho ma trận quyền (owner bộ / member / manager / người ngoài / người đã rời / nhóm đã xóa / bộ đã xóa) trên **mọi** endpoint đọc và ghi tiến độ. Sau đó thay các chỗ gọi `requireOwnedSet` ở §4. Toàn bộ test cũ phải xanh để chứng minh hành vi của owner không đổi.
- [ ] **3. CRUD nhóm, thành viên, quyền**: service `src/server/services/teams.ts` cùng `teams-api.ts`, rate limit join/invite qua `rate-limit.ts`.
- [ ] **4. Lời mời + link/mã**: lời mời trong app, gửi email best-effort, chống dò tài khoản, hết hạn sau 14 ngày.
- [ ] **5. Gắn bộ + hạn chót + học**: `team_sets`, mở rộng `dueCards` và `GET /sets/:id`, trang bộ thẻ chỉ đọc, sao chép về thư viện, tab Thư viện, “Bài được giao” trên Home.
- [ ] **6. Thống kê nhóm**: `team-stats.ts`, kèm test cô lập dữ liệu (không lộ bộ riêng của thành viên, không lộ thành viên đã rời, manager không có tên trong bảng).
- [ ] **7. UI Nhóm**: `/teams`, `/teams/join/[code]`, `/teams/[id]` cùng các tab, trang chi tiết thành viên, menu quyền. Có component test cho menu quyền và bảng tiến độ.
- [ ] **8. Thống kê cá nhân**: khối “Nhóm của tôi” trong `/stats`.
- [ ] **9. Kiểm tra**: E2E nhiều người dùng (Playwright, 3 browser context: owner, member, manager) theo kịch bản nghiệm thu §9. Chạy axe và kiểm tra tràn layout trên `/teams/*` ở 320/375/768/1024/1440, sáng và tối. Chạy agent code-reviewer và security-reviewer (IDOR, liệt kê dữ liệu, leo thang quyền).
- [ ] **10. Tài liệu**: cập nhật `specs/state.md` (nhật ký có timestamp), sửa `specs/phase-5-community.md` §5 trỏ sang Nhóm, ghi chú deploy (chạy migration trên Neon trước khi deploy).

## 9. Tiêu chí nghiệm thu

- [ ] A tạo nhóm và gắn 2 bộ (1 bộ có hạn chót). B tham gia bằng link, C được mời qua email rồi chấp nhận trong app.
- [ ] B học bộ của A. Tiến độ của B được lưu riêng, A **không** bị đổi tiến độ. Thẻ đến hạn của bộ nhóm có trong `/review` của B.
- [ ] B **không** sửa hay xóa được bộ, và **không** gọi được `GET /teams/:id/members` hay `/stats` (403).
- [ ] A cấp cho D (người ngoài, `manager`) chỉ quyền `view_stats`. D xem được thống kê nhưng không mời, không xóa thành viên, không gắn bộ. D không có tên trong bảng tiến độ.
- [ ] A cấp “Toàn quyền” cho C. C mời và xóa được thành viên nhưng **không** cấp quyền cho người khác và không xóa được nhóm.
- [ ] Bảng thống kê của A hiện đúng % đã thuộc, thời gian học, điểm kiểm tra, trạng thái hạn chót và thẻ hay sai của B. Nó **không** có dữ liệu B học trên bộ riêng của B.
- [ ] `/stats` của B có khối “Nhóm của tôi” và streak/thời gian tính cả phần học bộ nhóm.
- [ ] B rời nhóm: bộ nhóm trả 404, thẻ biến mất khỏi `/review`, lịch sử trong `/stats` vẫn còn. B vào lại thì tiến độ cũ quay lại.
- [ ] Mời một email chưa có tài khoản vẫn trả 202 như email có tài khoản. Sau khi đăng ký bằng email đó thì thấy lời mời.
- [ ] Khóa đăng ký hoặc tạo mã mới thì link cũ bị từ chối.
- [ ] Toàn bộ test cũ xanh. Coverage của code mới ≥ 80%.

## 10. Rủi ro

| Mức | Rủi ro | Giảm thiểu |
|---|---|---|
| HIGH | Sót một chỗ `requireOwnedSet` → lộ bộ riêng tư (IDOR), hoặc ngược lại thành viên bị 404 khi học | Gom hết vào `access.ts`, có ma trận integration test cho từng endpoint, chạy security-reviewer |
| HIGH | Leo thang quyền (người có `invite` tự cấp quyền cao hơn qua lời mời) | Người mời chỉ cấp được tập con quyền mình có, chỉ owner sửa quyền, có test riêng |
| MED | Dò tài khoản qua form mời email | Luôn trả 202, lời mời lưu theo email |
| MED | Truy vấn thống kê chậm với 100 thành viên × 30 bộ | Truy vấn gom nhóm theo `(user_id, set_id)` dùng index sẵn có `progress_user_set_idx`, giới hạn khoảng thời gian, đo bằng dữ liệu mẫu |
| MED | Thời gian học của phiên Ôn tập gộp (`set_id null`) bị tính thiếu | Bù bằng `review_logs.duration_ms`, dùng chung một hàm với `stats.ts` |
| MED | Xung đột migration với công việc AI đang làm song song (`0007`) | Sinh migration ở thời điểm làm, rebase trước khi merge |
| LOW | Chủ bộ xóa thẻ làm mất tiến độ của thành viên trên thẻ đó | Hành vi đúng (thẻ không còn). Hiện cảnh báo khi sửa bộ đang gắn nhóm |
| LOW | Email lời mời không tới vì Resend production chưa cấu hình | Lời mời trong app là kênh chính, email chỉ là kênh phụ |

## 11. Ngoài phạm vi (để bản sau)

Xuất CSV, bảng xếp hạng trong nhóm, thông báo push hoặc email nhắc hạn chót, chat/bình luận, thành viên cùng sửa bộ thẻ, nhóm con.

## 12. Câu hỏi mở (cần người dùng trả lời trước khi code)

1. **Nhánh gốc:** `main` chưa có migration `0006` và công việc AI ở `feat/ai-pipeline-speed`. Đề xuất: merge `feat/ai-pipeline-speed` trước, rồi tách `feat/teams` từ `main`, để tránh trùng số migration.
2. **“Hoàn thành” một bộ có hạn chót:** đề xuất là 100% thẻ ở trạng thái đã thuộc. Có muốn ngưỡng khác không, ví dụ 90%?

**Ước lượng:** độ phức tạp **CAO**. Backend và phân quyền khoảng 2 ngày, thống kê khoảng 1 ngày, UI khoảng 2 ngày, test/E2E/review khoảng 1 ngày.
