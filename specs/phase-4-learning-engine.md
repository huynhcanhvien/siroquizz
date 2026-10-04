# Phase 4 — Học thông minh & nội dung phong phú

**Trạng thái:** chưa bắt đầu
**Phụ thuộc:** Phase 2 (có thể làm song song với Phase 3)
**Kết quả:** chế độ **Học** thích ứng, lặp lại ngắt quãng theo FSRS với hàng đợi ôn tập hằng ngày, gắn sao thẻ, thống kê, streak và mục tiêu ngày, nhắc học, thẻ có ảnh.

## Mục tiêu

1. Giúp người dùng ghi nhớ lâu thay vì chỉ học thuộc một lần.
2. Tạo thói quen học mỗi ngày bằng streak, mục tiêu và nhắc nhở.
3. Cho người dùng thấy tiến bộ của mình qua số liệu.

## Phạm vi

### 1. Chế độ Học (`/study/[id]/learn`)
- Chia thành các vòng, mỗi vòng 7 thẻ. Một thẻ đi qua các bậc: **Trắc nghiệm → Tự luận**. Trả lời đúng ở bậc Tự luận thì thẻ được tính là đã thuộc trong phiên.
- Trả lời sai thì hiện đáp án đúng, và thẻ quay lại ở vòng sau.
- Tùy chọn: chỉ học thẻ gắn sao, trả lời bằng thuật ngữ hoặc định nghĩa, tắt Tự luận.
- Dùng lại `generate-test.ts` và `grade.ts` của Phase 1. Logic điều phối là một state machine thuần trong `features/learn/lib/learn-engine.ts`.
- Màn giữa các vòng: thanh tiến độ “Đã thuộc / Đang học / Chưa học”, động lực bằng điểm và streak.

### 2. Lặp lại ngắt quãng (FSRS)
- Dùng thư viện `ts-fsrs`, bọc trong `features/srs/lib/scheduler.ts` để có thể thay thuật toán sau này.
- Mỗi lần trả lời ở Flashcards (phân loại), Học hoặc Ôn tập đều cập nhật trạng thái FSRS:
  - Đúng nhanh → `Good`.
  - Đúng nhưng chậm hoặc dùng gợi ý → `Hard`.
  - Sai → `Again`.
  - Ở chế độ Ôn tập, người dùng tự chấm 4 mức.
- Bảng `card_progress` thêm cột `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`, giữ `status` để tương thích ngược.
- **Ôn tập hôm nay** (`/review`):
  - Hàng đợi thẻ đến hạn trên mọi bộ thẻ, tối đa 200 thẻ mỗi phiên.
  - Thẻ mới tối đa 20 mỗi ngày (chỉnh được).
  - Home hiển thị số thẻ đến hạn.
- Cấu hình trong Cài đặt: số thẻ mới mỗi ngày, độ giữ nhớ mục tiêu (`request_retention`, mặc định 0.9).

### 3. Gắn sao thẻ
- Bảng `card_stars (user_id, card_id)`.
- Nút sao trên thẻ ở trang tổng quan, Flashcards và Học. Có bộ lọc “Chỉ thẻ gắn sao” ở mọi chế độ học và trò chơi.

### 4. Thống kê (`/stats`)
- Lịch hoạt động dạng heatmap 365 ngày.
- Streak hiện tại và dài nhất.
- Số thẻ đã thuộc theo thời gian.
- Độ chính xác theo bộ thẻ.
- Thời gian học theo tuần.
- Dự báo số thẻ đến hạn trong 7 ngày tới.
- Bảng `study_sessions`: `id, user_id, set_id null, mode, started_at, ended_at, cards_seen, correct, incorrect`.
- Biểu đồ dùng chung token màu của design system, có bảng dữ liệu thay thế cho trình đọc màn hình. Load skill `dataviz` khi làm phần này.

### 5. Streak, mục tiêu & nhắc học
- Mục tiêu ngày: số phút hoặc số thẻ. Đạt mục tiêu thì streak +1.
- “Đóng băng streak” (giữ streak khi nghỉ): 1 lần mỗi tuần.
- Nhắc học:
  - **Email** hằng ngày theo giờ người dùng chọn (Vercel Cron + Resend), chỉ gửi khi hôm đó chưa học.
  - **Web Push** (tùy chọn, xin quyền khi người dùng bật).
  - Mọi email đều có link hủy đăng ký một chạm.
- Lưu múi giờ của người dùng (mặc định `Asia/Ho_Chi_Minh`).

### 6. Thẻ có ảnh
- Mỗi thẻ có tối đa 1 ảnh (tải lên R2). Ở server, ảnh được thu nhỏ và chuyển sang WebP rộng tối đa 800px, giới hạn 5MB.
- Ảnh hiển thị ở mặt định nghĩa của Flashcards, trong Học, Kiểm tra và Lật thẻ trí nhớ (dùng ảnh làm “định nghĩa”).
- Có trường `alt` cho ảnh. Nếu bỏ trống thì dùng định nghĩa làm alt.

**Ngoài phạm vi:** ghi âm giọng nói, chấm phát âm, định dạng chữ phức tạp.

## API mới

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/v1/reviews` | Ghi một lượt trả lời `{ cardId, rating, mode, durationMs }` → trả trạng thái FSRS mới |
| GET | `/api/v1/reviews/due?limit=` | Hàng đợi ôn tập |
| GET | `/api/v1/stats/overview` | Streak, mục tiêu, các con số tổng |
| GET | `/api/v1/stats/activity?from&to` | Dữ liệu heatmap |
| POST | `/api/v1/sessions`, PATCH `/api/v1/sessions/:id` | Bắt đầu / kết thúc phiên học |
| PUT / DELETE | `/api/v1/cards/:id/star` | Gắn / bỏ sao |
| POST | `/api/v1/cards/:id/image` | Xin presigned URL để tải ảnh |
| PATCH | `/api/v1/me/preferences` | Mục tiêu ngày, giờ nhắc, múi giờ, cấu hình FSRS |

## Thứ tự triển khai

- [ ] 1. `learn-engine` (state machine thuần) kèm test, rồi UI chế độ Học.
- [ ] 2. Migration các cột FSRS. Viết `scheduler.ts` kèm test (bao gồm các ca biên múi giờ và nửa đêm).
- [ ] 3. Endpoint review. Nối Flashcards và Học vào FSRS.
- [ ] 4. Trang Ôn tập hôm nay, widget trên Home.
- [ ] 5. Gắn sao và bộ lọc ở mọi chế độ.
- [ ] 6. `study_sessions`, trang thống kê, heatmap.
- [ ] 7. Streak, mục tiêu, nhắc học qua email, Web Push.
- [ ] 8. Ảnh trên thẻ.

## Tiêu chí nghiệm thu

- [ ] Học hết một bộ 20 thẻ ở chế độ Học: mọi thẻ đi qua đủ 2 bậc, thẻ sai quay lại đúng như thiết kế.
- [ ] Sau khi ôn, `due` của thẻ khớp với kết quả `ts-fsrs` (unit test với thời gian cố định).
- [ ] Home hiển thị đúng số thẻ đến hạn theo múi giờ người dùng.
- [ ] Streak tăng khi đạt mục tiêu và không bị mất khi dùng “đóng băng”.
- [ ] Email nhắc chỉ gửi khi hôm đó chưa học, link hủy đăng ký hoạt động.
- [ ] Ảnh thẻ hiển thị đúng và có alt. Ảnh lớn được thu nhỏ.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Lỗi ranh giới ngày theo múi giờ | Lưu UTC, tính “ngày học” theo múi giờ người dùng, test các ca biên |
| Spam thông báo | Mặc định tắt Web Push, email tối đa 1 lần/ngày, hủy một chạm |
| Bảng `card_progress` phình to | Có index `(user_id, due)`, phân trang hàng đợi |
