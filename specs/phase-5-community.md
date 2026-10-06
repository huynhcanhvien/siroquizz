# Phase 5 — Chia sẻ, cộng đồng & lớp học

**Trạng thái:** đang làm (nhánh `feat/phase5-community`): đợt 1 (chia sẻ, `access.ts`, kiểm duyệt, báo cáo, admin, credit thưởng), đợt 2 (Khám phá, hồ sơ), đợt 3 (thư mục), đợt 4 (lớp học), đợt 5 (bảng xếp hạng) xong; còn đợt 6 (review bảo mật + E2E nhiều người)
**Phụ thuộc:** Phase 2 (nên có Phase 4 để lớp học có dữ liệu tiến độ)
**Kết quả:** bộ thẻ có thể chia sẻ, có trang khám phá bộ thẻ công khai, thư mục, lớp học cho giáo viên, bảng xếp hạng trò chơi, và công cụ kiểm duyệt nội dung.

## Mục tiêu

1. Người dùng chia sẻ và tái sử dụng bộ thẻ của nhau.
2. Giáo viên dùng SiroQuizz cho lớp học: giao bài và theo dõi tiến độ.
3. Giữ cộng đồng an toàn bằng báo cáo vi phạm và kiểm duyệt.

## Phạm vi

### 1. Quyền hiển thị & chia sẻ
- `study_sets.visibility` có 3 giá trị:
  - `private`: chỉ chủ sở hữu.
  - `unlisted`: ai có link đều xem được.
  - `public`: xuất hiện trong trang khám phá.
- Thêm `slug` ngẫu nhiên (10 ký tự), dùng URL công khai `/s/[slug]`.
- Hộp thoại Chia sẻ: chọn quyền hiển thị, sao chép link, mã QR.
- Trang công khai `/s/[slug]`:
  - Render ở server, khách chưa đăng nhập vẫn xem được danh sách thẻ và học Flashcards.
  - Chế độ khác (Kiểm tra, Trò chơi) yêu cầu đăng nhập để lưu tiến độ.
- “Tạo bản sao vào thư viện”: sao chép thẻ, lưu `copied_from_id`, ghi nguồn tác giả gốc.

### 2. Khám phá (`/explore`)
- Tìm kiếm bộ thẻ công khai theo tiêu đề, mô tả và thuật ngữ.
- Dùng Postgres với `pg_trgm` (hợp với cả tiếng Việt và tiếng Trung, vốn không tách từ bằng khoảng trắng) kết hợp `unaccent` để tìm tiếng Việt không dấu.
- Bộ lọc: cặp ngôn ngữ, số thẻ, sắp xếp theo liên quan / mới / phổ biến.
- Mục “Phổ biến tuần này” (số lượt học trong 7 ngày) và theo chủ đề (tag do tác giả gắn, tối đa 5 tag mỗi bộ).

### 3. Hồ sơ công khai (`/u/[username]`)
- `username` duy nhất, đổi tối đa 1 lần mỗi 30 ngày.
- Hiển thị các bộ thẻ công khai và thống kê đơn giản. Người dùng có thể ẩn hồ sơ.

### 4. Thư mục (`/folders`)
- Thư mục cá nhân. Một bộ thẻ có thể nằm trong nhiều thư mục (bảng `folder_sets`).
- Kéo thả trong Thư viện. Có thể học cả thư mục: gộp thẻ của các bộ cho Flashcards, Kiểm tra và Ôn tập.

### 5. Lớp học (`/classes`)
- Vai trò: `owner` (giáo viên), `teacher` (đồng giáo viên), `student`.
- Tạo lớp và nhận mã tham gia 6 ký tự cùng link mời. Giáo viên có thể khóa đăng ký, xóa thành viên.
- Giao bộ thẻ cho lớp, có hạn chót tùy chọn. Học sinh thấy mục “Bài được giao” trên Home.
- Bảng tiến độ của giáo viên: mỗi học sinh × mỗi bộ thẻ (% đã thuộc, điểm kiểm tra gần nhất, lần học cuối). Xuất được CSV.
- Học sinh thấy được bộ thẻ được giao ngay cả khi bộ đó `private`. Quyền xem đi theo lớp.

### 6. Bảng xếp hạng trò chơi
- Bảng xếp hạng theo từng bộ thẻ cho Ghép thẻ (thời gian) và Rơi từ (điểm). Có các phạm vi: toàn bộ, trong lớp, bạn bè (tùy chọn sau).
- Chống gian lận:
  - Server tạo `gameSessionId` và seed bàn chơi.
  - Client gửi chuỗi sự kiện, server xác thực thời gian tối thiểu hợp lý (vd. ≥ 300ms mỗi cặp).
  - Loại điểm bất thường.

### 7. Kiểm duyệt
- Nút “Báo cáo” trên bộ thẻ công khai và hồ sơ. Lý do: spam, nội dung không phù hợp, bản quyền, khác.
- Vai trò `admin` và trang `/admin/reports`: xem, ẩn bộ thẻ, cảnh cáo hoặc khóa tài khoản. Mọi hành động đều ghi audit log.
- Khi bộ thẻ chuyển sang `public`: kiểm tra tự động bằng `claude-haiku-4-5-20251001`. Nếu nghi vi phạm thì đưa vào hàng chờ duyệt, chưa hiển thị ngay.

### 8. Credit AI (đã chốt với người dùng 2026-10-05)
- **Đã làm** (nhánh `feat/ai-credits`): 1 credit = 1.000 token Groq thực dùng. **20 credit miễn phí/ngày**, reset 0h giờ VN, **không cộng dồn**. **Credit thưởng không hết hạn**, lưu ở bảng `credit_ledger`. Dùng credit miễn phí trước, credit thưởng sau. Báo giá sau khi đọc tài liệu; ≤ 5 credit và đủ credit miễn phí thì chạy luôn, còn lại người dùng xác nhận (có thể giảm số thẻ). Tối đa 40 credit/lần tạo, 10 trang OCR/lần, 2 lần tạo chưa xong/người, hạn mức chung toàn app. **Chỉ hoàn credit khi lỗi do hệ thống** (`SYSTEM_ERROR_CODES`); lỗi do người dùng/tự hủy thì trừ đúng token đã dùng; thông báo lỗi nói rõ nguyên nhân và đã hoàn hay đã trừ. Cùng file + yêu cầu + tùy chọn → dùng lại kết quả (0 credit, giữ 30 ngày).
- **Quy tắc thưởng** trong [credits.ts](../src/server/ai/credits.ts), **đã nối** (đợt 1):
  - `awardPublishCredit`: +5 khi bộ chuyển `public` **và qua kiểm duyệt**; một lần mỗi bộ; bộ ≥ 10 thẻ; bản sao của người khác không được thưởng. → gọi khi kiểm duyệt duyệt bộ.
  - `awardCopyCredit`: +1 cho tác giả mỗi người khác sao chép bộ (một lần mỗi người/bộ, không tính tự sao chép), tối đa 30/ngày. → gọi trong "Tạo bản sao vào thư viện".
  - `clawbackSetCredits`: thu hồi toàn bộ thưởng của bộ khi bị gỡ do vi phạm. → gọi khi admin ẩn bộ.
- Chưa làm: chống bộ trùng nội dung (cần hash nội dung bộ thẻ khi công khai).

**Ngoài phạm vi:** chat hoặc bình luận, chế độ thi realtime nhiều người, tích hợp LMS.

## Schema mới

```
study_sets   + visibility enum(private|unlisted|public) default private, slug unique, copied_from_id null,
             tags text[], study_count_7d int (cập nhật bằng cron)
folders      id, user_id, name, created_at
folder_sets  folder_id, set_id, position — pk (folder_id, set_id)
classes      id, owner_id, name, description, join_code unique, join_locked bool, created_at
class_members class_id, user_id, role enum(owner|teacher|student), joined_at — pk (class_id, user_id)
class_sets   class_id, set_id, assigned_by, due_at null, assigned_at
game_sessions id, user_id, set_id, game, seed, started_at, finished_at, verified bool
reports      id, reporter_id, target_type enum(set|user), target_id, reason, note, status, handled_by, created_at
audit_logs   id, actor_id, action, target_type, target_id, meta jsonb, created_at
users        + username unique, profile_public bool, role enum(user|admin)
```

## Phân quyền (bắt buộc có test tích hợp cho từng dòng)

| Hành động | Ai được phép |
|---|---|
| Xem bộ thẻ `private` | Chủ sở hữu, thành viên lớp được giao bộ đó |
| Xem bộ thẻ `unlisted`/`public` | Bất kỳ ai (cả khách) |
| Sửa / xóa bộ thẻ | Chủ sở hữu |
| Xem tiến độ học sinh | `owner`/`teacher` của lớp, chỉ với các bộ được giao trong lớp |
| Ẩn nội dung, khóa tài khoản | `admin` |

Logic phân quyền tập trung trong `server/services/access.ts` (`canViewSet`, `canEditSet`, `canManageClass`...), không viết rải rác ở từng route.

## Thứ tự triển khai

- [x] 1. `visibility`, `slug`, trang `/s/[slug]` render ở server, hộp thoại Chia sẻ (link + QR), tạo bản sao (ghi nguồn).
- [x] 2. `access.ts` kèm bộ test phân quyền (owner/người khác/khách/admin; luật lớp học thêm ở mục 6).
- [x] 3. Khám phá: index GIN `pg_trgm` trên cột `search_text` đã bỏ dấu sẵn trong code (thay cho `unaccent`, vốn không dùng được trong index), tag (tối đa 5), "Phổ biến tuần này" = số lượt sao chép trong 7 ngày.
- [x] 4. Hồ sơ công khai `/u/[username]`, username (đổi 30 ngày/lần, từ khóa dành riêng), ẩn hồ sơ.
- [x] 5. Thư mục: CRUD, một bộ ở nhiều thư mục, kéo thả trong Thư viện (+ menu "Thêm vào thư mục" cho bàn phím/cảm ứng), học cả thư mục: Ôn tập lọc theo thư mục (lưu lịch FSRS bình thường); Thẻ ghi nhớ/Kiểm tra gộp thẻ là **phiên luyện tập không lưu tiến độ** (kết quả gộp không thuộc riêng bộ nào).
- [x] 6. Lớp học: tạo (mã 6 ký tự, link mời có bước xác nhận), tham gia/rời, khóa đăng ký, đổi mã, đồng giáo viên, giao bộ (của chính giáo viên) có hạn chót, "Bài được giao" trên Home, bảng tiến độ học sinh × bộ (% đã thuộc, kiểm tra gần nhất, lần học cuối), xuất CSV ở trình duyệt (chống CSV injection). Quyền học qua lớp: `requireStudySet` thay cho kiểm tra chủ sở hữu ở mọi API học; rời lớp mất quyền ngay.
- [x] 7. Bảng xếp hạng Ghép thẻ (thời gian) / Rơi từ (điểm): server cấp seed, client gửi sự kiện, server **chơi lại** để tính kết quả, loại thao tác < 300ms / sai bàn / thời gian vượt thực tế; theo bộ và theo lớp (`classId`); chơi bằng bộ lọc sao thì không xếp hạng. Phạm vi "bạn bè" chưa làm.
- [x] 8. Báo cáo, trang admin, audit log, kiểm duyệt tự động. Kiểm duyệt dùng **`openai/gpt-oss-safeguard-20b` trên Groq** (không có key Anthropic): quét cứng link/SĐT/email toàn bộ + AI xem mẫu ~1.200 token (model chỉ 2.000 token/phút); bận thì `pending`, cron/nút "Kiểm tra lại" chạy lại. Cấp quyền admin: `DATABASE_URL=… pnpm admin:grant email`.
- [ ] 9. Review bảo mật (IDOR, liệt kê dữ liệu), E2E nhiều người dùng.

## Tiêu chí nghiệm thu

- [ ] Khách vào `/s/[slug]` của bộ `unlisted` xem và học Flashcards được. Bộ `private` trả 404.
- [ ] Tìm “tu vung du lich” ra bộ “Từ vựng du lịch”. Tìm “你好” ra bộ có thuật ngữ đó.
- [ ] Giáo viên tạo lớp → học sinh nhập mã tham gia → giao bộ thẻ → học sinh học → giáo viên thấy tiến độ cập nhật.
- [ ] Học sinh rời lớp thì mất quyền xem bộ `private` của lớp.
- [ ] Điểm Ghép thẻ không hợp lệ (quá nhanh, sai seed) bị loại khỏi bảng xếp hạng.
- [ ] Bộ thẻ bị báo cáo và bị admin ẩn thì biến mất khỏi Khám phá và link công khai.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Lộ dữ liệu qua IDOR | `access.ts` tập trung, có test cho từng vai trò, ID không đoán được |
| Nội dung xấu hoặc vi phạm bản quyền | Báo cáo, duyệt trước khi công khai, quy trình gỡ theo yêu cầu bản quyền |
| Tìm kiếm chậm khi dữ liệu lớn | Index GIN trigram, giới hạn kết quả, cache trang Phổ biến |
