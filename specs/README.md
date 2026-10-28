# SiroQuizz — Kế hoạch tổng thể

SiroQuizz là web app học từ vựng kiểu Quizlet. Người dùng tạo bộ flashcard, tự chọn dạng câu hỏi để kiểm tra, luyện qua trò chơi, và tạo bộ thẻ bằng AI từ tài liệu tải lên kèm yêu cầu (prompt).

Thư mục này chứa đặc tả theo từng phase. Mỗi phase có thể bàn giao và chạy được độc lập, và phase sau chỉ thay hoặc mở rộng lớp bên dưới chứ không viết lại phần đã có.

## Tài liệu

| File                                                     | Nội dung                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [state.md](state.md)                                     | **Trạng thái hiện tại, việc còn dở và nhật ký bàn giao (đọc đầu tiên khi tiếp quản)**                |
| [architecture.md](architecture.md)                       | Kiến trúc, cấu trúc thư mục, mô hình dữ liệu qua các phase, quy ước API, i18n, kiểm thử, bảo mật nền |
| [phase-1-ui-mock.md](phase-1-ui-mock.md)                 | Toàn bộ giao diện chạy với mock data (localStorage)                                                  |
| [phase-2-backend-auth.md](phase-2-backend-auth.md)       | Backend thật: tài khoản, CSDL, API, chuyển dữ liệu từ localStorage                                   |
| [phase-3-ai-generation.md](phase-3-ai-generation.md)     | Tạo bộ thẻ bằng AI thật (Groq API) từ PDF/DOCX/ảnh/văn bản + prompt                                  |
| [phase-4-learning-engine.md](phase-4-learning-engine.md) | Học thông minh: chế độ Học thích ứng, lặp lại ngắt quãng (FSRS), thống kê, streak, thẻ có ảnh        |
| [phase-5-community.md](phase-5-community.md)             | Chia sẻ & cộng đồng: công khai bộ thẻ, khám phá, thư mục, lớp học, bảng xếp hạng                     |
| [phase-6-production.md](phase-6-production.md)           | Sẵn sàng ra mắt: hạ tầng, CI/CD, giám sát, bảo mật, hiệu năng, PWA/offline, SEO, pháp lý             |
| [phase-7-collab-writing.md](phase-7-collab-writing.md)   | Thư viện lớp, cộng tác bộ thẻ (đề xuất sửa, quyền sửa), viết bài trực tuyến, bộ thẻ tạm, tối ưu pipeline |
| [adminpage.md](adminpage.md)                             | Khu quản trị `/admin`: tổng quan, kiểm duyệt, người dùng, AI & credit, bộ thẻ, nhật ký               |

## Đối tượng người dùng

- **Người học** (học sinh, sinh viên, người đi làm Việt Nam) học tiếng Anh, tiếng Trung và các ngoại ngữ khác. Nhóm này cần tạo thẻ nhanh, học mọi lúc, và có trò chơi để đỡ chán.
- **Người tự học từ tài liệu** có sẵn PDF giáo trình, ảnh chụp sách hoặc file Word. Nhóm này muốn AI rút ra bộ thẻ thay vì tự gõ.
- **Giáo viên** (từ Phase 5) cần tạo lớp, giao bộ thẻ và theo dõi tiến độ học sinh.

## Lộ trình

| Phase                                                 | Mục tiêu                          | Kết quả bàn giao                                                                                          | Điều kiện để sang phase sau                                                           |
| ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **1. UI + mock** ✅ _(xong 2026-10-04)_               | Chốt UX của mọi chức năng         | App chạy hoàn toàn trên trình duyệt, dữ liệu ở localStorage, đăng nhập và AI giả lập                      | Mọi luồng E2E pass, giao diện được duyệt ở 3 ngôn ngữ và 2 theme                      |
| **2. Backend & tài khoản** 🚧 _(nền tảng đã bắt đầu)_ | Dữ liệu thật, đồng bộ đa thiết bị | Postgres + API + auth (email/mật khẩu, Google), xác minh email, quên mật khẩu, nhập dữ liệu cũ            | Repository local được thay bằng HTTP mà không đổi UI, test tích hợp pass              |
| **3. AI generation**                                  | Tạo thẻ từ tài liệu thật          | Upload lên object storage, trích xuất nội dung, Claude API sinh thẻ có cấu trúc, quota/chi phí            | Bộ eval đạt ngưỡng chất lượng, chi phí trung bình mỗi lần tạo nằm trong ngân sách     |
| **4. Học thông minh**                                 | Tăng hiệu quả ghi nhớ             | Chế độ Học thích ứng, FSRS, hàng đợi ôn tập hằng ngày, thống kê, streak, nhắc học, thẻ có ảnh             | Hàng đợi ôn tập đúng thuật toán (unit test), dashboard thống kê chạy với dữ liệu thật |
| **5. Cộng đồng**                                      | Lan tỏa và dùng trong lớp học     | Bộ thẻ công khai/không công khai, trang khám phá, thư mục, lớp học, bảng xếp hạng, kiểm duyệt             | Phân quyền được kiểm thử, bộ thẻ riêng tư không thể bị truy cập trái phép             |
| **6. Production**                                     | Ra mắt công khai                  | Hạ tầng, CI/CD, Sentry, CSP, Lighthouse CI, PWA offline, SEO, chính sách quyền riêng tư, xuất/xóa dữ liệu | Checklist ra mắt hoàn tất                                                             |

**Phụ thuộc giữa các phase.** Phase 1 là tiền đề cho Phase 2. Phase 3 và 4 cùng dựa trên Phase 2 và có thể làm song song nếu có 2 người. Phase 5 cần Phase 2 (nên có Phase 4 trước để có dữ liệu tiến độ cho lớp học). Phase 6 tiếp nối toàn bộ, nhưng CI cơ bản đã bắt đầu từ Phase 2.

## Nguyên tắc xuyên suốt

1. **UI không biết dữ liệu đến từ đâu.** Component chỉ gọi hook, hook gọi repository qua TanStack Query. Đổi nguồn dữ liệu chỉ là đổi phần cài đặt repository (xem [architecture.md](architecture.md)).
2. **Schema dùng chung.** Schema zod viết ở Phase 1 (`features/*/schemas.ts`) được dùng lại để validate ở server từ Phase 2.
3. **Logic thuần, dễ test.** Logic tạo đề, chấm điểm, game, FSRS và parse văn bản đều là hàm thuần trong `lib/`, viết test trước theo TDD.
4. **3 ngôn ngữ ngay từ đầu.** Mọi chuỗi UI nằm trong `messages/{vi,en,zh}.json`, không hardcode.
5. **Bảo mật mặc định.** Validate ở mọi biên hệ thống, không có secret trong code, nội dung tài liệu người dùng luôn là dữ liệu chứ không phải lệnh cho AI.

## Definition of Done (áp dụng cho mọi phase)

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` đều pass.
- [ ] Độ phủ test ≥ 80% cho logic (`src/lib`, `src/features/**/lib`, repository, schema; thêm service/API từ Phase 2).
- [ ] Có E2E Playwright cho các luồng chính của phase.
- [ ] Đủ chuỗi dịch ở cả 3 ngôn ngữ, không còn key thiếu.
- [ ] Kiểm tra responsive ở 320 / 768 / 1024 / 1440, ở cả light và dark.
- [ ] Bàn phím dùng được, focus hiển thị rõ, tôn trọng `prefers-reduced-motion`, đủ độ tương phản (WCAG 2.2 AA).
- [ ] Đã review code (code-reviewer, thêm security-reviewer khi chạm auth, API hoặc upload) và không còn lỗi CRITICAL/HIGH.
- [ ] Đã cập nhật spec của phase (trạng thái, quyết định đã chốt, phần làm khác kế hoạch).

## Nhật ký quyết định

| Ngày       | Quyết định                                                | Lý do                                                                                         |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-10-04 | Khóa AI hiện có là `GROQ_LLM_API`; dự kiến dùng Groq ở P3 | Giữ tên biến người dùng đã cung cấp; cần cập nhật extraction/model/eval trước khi thay Claude |
| 2026-10-04 | Next.js (App Router) + TypeScript + Tailwind              | Gom frontend và API trong một repo, dễ triển khai                                             |
| 2026-10-04 | Phase 1 chạy trên mock data lưu localStorage              | Đánh giá được UX thật trước khi đầu tư backend                                                |
| 2026-10-04 | UI 3 ngôn ngữ: Việt (mặc định), Trung giản thể, Anh       | Phục vụ người học tiếng Anh và tiếng Trung                                                    |
| 2026-10-04 | 4 trò chơi: Ghép thẻ, Rơi từ, Lật thẻ trí nhớ, Xếp chữ    | Người dùng chọn                                                                               |
| 2026-10-04 | Thẻ có thêm trường phiên âm (pinyin/IPA) tùy chọn         | Hỗ trợ học tiếng Trung                                                                        |

## Ngoài phạm vi (có thể làm sau Phase 6)

- App mobile native (Expo/React Native dùng chung API).
- Tiện ích trình duyệt để lưu từ khi đọc web.
- Tích hợp LMS (Google Classroom, Moodle).
- Chế độ thi trực tiếp nhiều người chơi kiểu Quizlet Live / Kahoot (realtime).
