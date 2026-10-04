# Phase 1 — Giao diện đầy đủ chạy với mock data

**Trạng thái:** ✅ Hoàn thành (2026-10-04 14:38 +07). Chi tiết bàn giao ở [state.md](state.md)
**Phụ thuộc:** không có
**Kết quả:** app Next.js chạy hoàn toàn trên trình duyệt. Mọi chức năng dùng được thật với dữ liệu ở localStorage, còn đăng nhập và AI là giả lập.

## Mục tiêu

1. Chốt UX của toàn bộ sản phẩm trước khi đầu tư backend.
2. Dựng kiến trúc dữ liệu (repository + TanStack Query) để Phase 2 chỉ cần thay phần cài đặt.
3. Viết sẵn logic thuần (tạo đề, chấm, game, parse) kèm test, để dùng lại ở các phase sau.

## Phạm vi

**Trong phạm vi**
- Landing, đăng ký, đăng nhập, quên mật khẩu (chỉ giao diện).
- Home, Thư viện, trình soạn bộ thẻ (có dialog Nhập văn bản), trang tổng quan bộ thẻ, Cài đặt.
- Flashcards, Bài kiểm tra 4 dạng, 4 trò chơi, tạo thẻ bằng AI giả lập.
- 3 ngôn ngữ UI, light/dark, responsive từ 320px.

**Ngoài phạm vi** (để phase sau): backend, gửi email, OAuth thật, upload lên server, AI thật, chế độ Học/FSRS, chia sẻ công khai.

## Stack

- Next.js 16.3 (App Router), React 19.3, TypeScript strict, pnpm.
- Tailwind CSS 4.3 với design token đặt trong `globals.css`.
- next-intl 4, không định tuyến theo locale. Locale lưu trong cookie `NEXT_LOCALE`, mặc định `vi`.
- radix-ui làm primitive headless, lucide-react cho icon, next-themes cho light/dark.
- TanStack Query 5, react-hook-form + zod 4.
- Vitest 5 + Testing Library, Playwright 1.63.
- Không dùng thư viện animation: hiệu ứng làm bằng CSS transform/opacity, game Rơi từ dùng `requestAnimationFrame`.

## Hướng thiết kế

- Phong cách thân thiện, sáng, thoáng như Quizlet, với nhận diện riêng “Siro”:
  - Màu chính là indigo `oklch(55% 0.22 268)`.
  - Màu nhấn là vàng siro `oklch(80% 0.16 75)`, dùng cho streak, điểm, highlight.
  - Màu ngữ nghĩa: success xanh lá, error đỏ san hô, warning.
  - Nền `oklch(97.5% 0.008 270)`, các surface màu trắng.
- Font Be Vietnam Pro, fallback Noto Sans SC cho chữ Hán (qua `next/font/google`).
- Phân cấp rõ: tiêu đề display đậm, thẻ học to nổi nhất, chế độ học dạng tile có icon. Radius và bóng đổ thay đổi theo tầng.
- Hover, focus và active được thiết kế riêng. Flip 3D chuyển sang crossfade khi `prefers-reduced-motion`.
- Dark mode có bộ token riêng chứ không chỉ đảo màu.

## Routes

| Nhóm | Đường dẫn | Màn hình |
|---|---|---|
| `(marketing)` | `/` | Landing: hero, thẻ lật minh họa, 4 tính năng, CTA |
| `(auth)` | `/login`, `/register`, `/forgot-password` | Form và validate. Nút Google/Apple chỉ là UI (toast “sắp ra mắt”) |
| `(app)` | `/home` | Lời chào, “Tiếp tục học”, bộ thẻ gần đây, tạo nhanh |
| | `/library` | Bộ thẻ của tôi, có tìm kiếm, sắp xếp và lọc theo nguồn |
| | `/sets/new`, `/sets/[id]/edit` | Trình soạn bộ thẻ |
| | `/sets/new/ai` | Tạo bằng AI (upload + prompt) |
| | `/sets/[id]` | Tổng quan: tile chế độ học, danh sách thẻ, tiến độ |
| | `/settings` | Hồ sơ, ngôn ngữ, giao diện, đăng xuất |
| `(study)` | `/study/[id]/flashcards`, `/study/[id]/test` | Học thẻ, bài kiểm tra |
| | `/study/[id]/games`, `/study/[id]/games/{match,gravity,memory,scramble}` | Trò chơi |

Auth guard chạy ở client trong layout `(app)` và `(study)`. Nếu chưa có session thì chuyển về `/login?next=<đường dẫn>`, và chỉ chấp nhận `next` là đường dẫn nội bộ bắt đầu bằng `/`.

## Đặc tả chức năng

### 1. Tài khoản (giả lập)
- **Đăng ký:** tên hiển thị (2–40 ký tự), email, mật khẩu ≥ 8 ký tự gồm chữ và số, xác nhận mật khẩu, checkbox điều khoản.
- **Đăng nhập:** email, mật khẩu, “Ghi nhớ đăng nhập”. Báo lỗi chung “Email hoặc mật khẩu không đúng”.
- **Quên mật khẩu:** nhập email rồi hiện màn “Đã gửi hướng dẫn”.
- Mật khẩu băm SHA-256 bằng `crypto.subtle` chỉ để mô phỏng. Code có ghi chú rõ là KHÔNG an toàn và sẽ được thay ở Phase 2.
- Sau khi đăng ký thì seed 3 bộ mẫu: IELTS cơ bản (EN→VI), HSK1 có pinyin (ZH→VI), Du lịch (VI→EN).

### 2. Bộ thẻ
- **Thư viện:** tìm theo tiêu đề, sắp xếp theo gần đây / tên / số thẻ, lọc theo nguồn. Có empty state kèm CTA tạo bộ thẻ.
- **Trình soạn:**
  - Các trường tiêu đề, mô tả, ngôn ngữ thuật ngữ, ngôn ngữ định nghĩa.
  - Mỗi dòng thẻ gồm thuật ngữ, định nghĩa, phiên âm (tùy chọn).
  - Có thể thêm, xóa, đổi thứ tự lên/xuống. Nhấn Tab ở ô cuối thì tạo dòng mới.
  - Nút “Đảo thuật ngữ ↔ định nghĩa”.
  - Validate: tiêu đề bắt buộc, tối thiểu 2 thẻ, thuật ngữ và định nghĩa không rỗng, tối đa 500 thẻ.
- **Dialog Nhập:**
  - Dán văn bản, chọn ký tự phân tách giữa thuật ngữ/định nghĩa (Tab / dấu phẩy / “ - ” / tùy chỉnh) và giữa các thẻ (xuống dòng / dấu chấm phẩy / tùy chỉnh).
  - Xem trước số thẻ hợp lệ và các dòng lỗi.
- **Tổng quan:**
  - Tiêu đề, tác giả, số thẻ.
  - Tile chế độ: Flashcards, Kiểm tra, Trò chơi.
  - Thanh tiến độ Đã biết / Đang học / Chưa học, danh sách thẻ kèm nút phát âm.
  - Menu: sửa, nhân bản, xóa (có dialog xác nhận).

### 3. Flashcards
- Thẻ lớn lật 3D. Phím tắt: `Space`/`↑`/`↓` lật thẻ. Khi bật theo dõi tiến độ, `←`/`1` là Đang học và `→`/`2` là Đã biết (giống Quizlet); khi tắt theo dõi, `←/→` chuyển thẻ. Phím `Space`/`Enter` nhường cho nút đang được focus, giữ phím không lặp lại hành động.
- Tùy chọn: xáo trộn, mặt trước (thuật ngữ/định nghĩa), bật chế độ phân loại.
- Phát âm qua Web Speech API theo ngôn ngữ của mặt đang hiển thị. Nếu trình duyệt không hỗ trợ thì ẩn nút.
- Chế độ phân loại cập nhật `CardProgress`. Cuối vòng hiện màn tổng kết với nút “Học lại N thẻ chưa thuộc” và “Bắt đầu lại”.
- Thanh tiến độ hiển thị `i / N`.

### 4. Bài kiểm tra
- **Thiết lập:**
  - Số câu (1..số thẻ).
  - Trả lời bằng thuật ngữ / định nghĩa / cả hai.
  - Chọn ít nhất 1 dạng: Trắc nghiệm, Đúng/Sai, Tự luận, Ghép nối.
- **`generate-test.ts`** là hàm thuần `(cards, config, rng) → Question[]`:
  - Phân bổ đều số câu cho các dạng đã chọn.
  - Trắc nghiệm có tối đa 4 lựa chọn, đáp án nhiễu là các thẻ khác và không trùng nhau.
  - Đúng/Sai có khoảng 50% câu ghép sai.
  - Ghép nối gom tối đa 5 cặp mỗi câu.
  - Cùng `rng` seed thì luôn ra cùng kết quả (để test).
- **`grade.ts`:**
  - Chuẩn hóa trước khi so: NFC, trim, gộp khoảng trắng, không phân biệt hoa/thường, bỏ dấu câu ở hai đầu, giữ dấu tiếng Việt.
  - Định nghĩa có nhiều nghĩa ngăn bằng `;` hoặc `/` thì khớp một nghĩa là đủ.
  - Có nút “Tôi đã đúng” để tự ghi đè kết quả.
- **Làm bài:** cuộn một trang, có thanh tiến độ số câu đã trả lời. Nộp bài khi còn câu trống thì hỏi xác nhận.
- **Kết quả:** vòng tròn %, thời gian làm bài, danh sách câu sai kèm đáp án đúng, nút “Làm lại”, “Làm lại câu sai”, “Bài mới”. Kết quả lưu vào `TestResult`.

### 5. Trò chơi
- **Ghép thẻ (Match):**
  - Lưới 12 ô (6 cặp ngẫu nhiên). Bấm 2 ô: đúng thì 2 ô biến mất, sai thì rung và cộng 1s phạt.
  - Bộ có ít hơn 6 thẻ thì dùng toàn bộ thẻ. Lưu kỷ lục theo bộ thẻ.
- **Rơi từ (Gravity):**
  - Định nghĩa rơi từ trên xuống, người chơi gõ thuật ngữ rồi Enter.
  - Có 3 mạng, mỗi 5 từ đúng thì lên level và tăng tốc.
  - Phím `Esc` để tạm dừng.
  - Kết thúc thì liệt kê các từ bị trượt.
  - Chấm bằng hàm chuẩn hóa của `grade.ts`.
- **Lật thẻ trí nhớ (Memory):**
  - Lưới 4×3 úp, gồm 6 cặp thuật ngữ–định nghĩa. Lật 2 thẻ: khớp thì giữ ngửa, không khớp thì úp lại sau 800ms.
  - Đếm lượt và thời gian.
- **Xếp chữ (Scramble):**
  - Tách grapheme bằng `Intl.Segmenter`. Thuật ngữ nhiều từ thì xáo theo từ, một từ thì xáo theo ký tự.
  - Bấm ô chữ để xếp, bấm lại để gỡ. Có gợi ý là định nghĩa, nút “Gợi ý” mở thêm 1 ô đúng (trừ điểm).
  - Chuỗi xáo luôn khác chuỗi gốc khi có từ 2 grapheme khác nhau.
- Mỗi game có logic thuần trong `features/games/<game>/lib.ts` và hook điều khiển trạng thái. `GameResult` dùng chung để hiển thị điểm/thời gian, kỷ lục, nút chơi lại và đổi game.
- Game cần đủ số thẻ (Match/Memory ≥ 2, Gravity/Scramble ≥ 1). Không đủ thì hiện thông báo kèm link sửa bộ thẻ.

### 6. Tạo bộ thẻ bằng AI (giả lập)
- **Dropzone:**
  - Hỗ trợ kéo thả và bấm chọn, tối đa 5 file.
  - Định dạng chấp nhận: PDF, DOCX, TXT, MD, CSV, PNG, JPG/JPEG, WEBP.
  - Tối đa 10MB mỗi file. Kiểm tra cả MIME lẫn đuôi file.
- **Prompt:**
  - Tối đa 1000 ký tự, có bộ đếm.
  - Gợi ý bấm chọn được, ví dụ “Trích 20 từ vựng HSK2 kèm pinyin”, “Thuật ngữ sinh học và định nghĩa ngắn”.
- **Tùy chọn:** số thẻ (5–50), ngôn ngữ thuật ngữ/định nghĩa, kèm phiên âm.
- **Interface `CardGenerator.generate({ files, prompt, options, signal }, onProgress)`.** Bản mock:
  - TXT/MD/CSV: đọc nội dung thật, tự đoán ký tự phân tách và parse thành cặp.
  - Loại file khác hoặc không parse được: trả bộ thẻ mẫu theo ngôn ngữ đã chọn.
  - Báo 4 bước tiến độ (Đọc tài liệu → Phân tích → Tạo thẻ → Hoàn tất), hủy được qua `AbortSignal`.
- **Màn xem lại:** sửa, xóa, bỏ chọn từng thẻ, sửa tiêu đề, rồi “Lưu bộ thẻ” với `source: 'ai'`.

### 7. Đa ngôn ngữ & giao diện
- `LanguageSwitcher` (Tiếng Việt / 中文 / English) đặt ở header, trang auth và Cài đặt.
- Light/dark/theo hệ thống, chọn ở UserMenu và Cài đặt.
- Mobile: sidebar thành drawer, có nút tạo nhanh.

## Lưu trữ mock

- Key: `siroquizz:v1:users`, `:session`, `:sets`, `:progress`, `:testResults`, `:gameScores`.
- Đọc dữ liệu thì luôn parse lại bằng zod. Dữ liệu hỏng thì bỏ qua và ghi `console.warn` (chỉ ở môi trường dev).
- Mọi thao tác cập nhật trả về bản sao mới (bất biến).

## Thứ tự triển khai

- [x] 1. Scaffold, design token, font, next-intl, providers, Vitest, Playwright.
- [x] 2. `components/ui` và layout (header, sidebar, mobile nav, switcher, theme toggle).
- [x] 3. `lib/*` và repository kèm test, sau đó auth (form, guard, seed) rồi landing.
- [x] 4. Bộ thẻ: home, thư viện, trình soạn + dialog Nhập, trang tổng quan.
- [x] 5. Flashcards.
- [x] 6. Bài kiểm tra: viết test `generate-test`/`grade` trước, rồi đến UI.
- [x] 7. Trò chơi: viết test logic từng game trước, rồi đến UI.
- [x] 8. Tạo thẻ bằng AI (mock).
- [x] 9. Cài đặt, các trạng thái empty/loading/error, rà soát 3 bản dịch.
- [x] 10. E2E, kiểm tra responsive/a11y, review code (đã sửa toàn bộ lỗi HIGH/MEDIUM của review, trừ #12 được chuyển sang Phase 2).

## Tiêu chí nghiệm thu

- [x] Đăng ký xong thấy 3 bộ mẫu. Đăng xuất rồi vào `/home` thì bị chuyển về `/login`.
- [x] Tạo bộ thẻ 4 thẻ, sửa, nhân bản, xóa đều chạy. Dữ liệu còn nguyên sau khi tải lại trang.
- [x] Dialog Nhập parse đúng văn bản phân tách bằng Tab và “ - ”.
- [x] Flashcards lật được bằng chuột và bàn phím. Chế độ phân loại cập nhật tiến độ ở trang tổng quan.
- [x] Bài kiểm tra trộn đủ 4 dạng câu hỏi, chấm đúng và lưu kết quả.
- [x] Cả 4 game chơi được đến hết, có màn kết quả và lưu kỷ lục.
- [x] AI mock với file `.txt` cho ra thẻ đúng nội dung file, lưu được vào thư viện. Hủy giữa chừng được.
- [x] Chuyển VI/中文/EN thì mọi chuỗi UI đổi theo, không còn key thô.
- [x] Không có cuộn ngang ở 320px. Light và dark đều đọc rõ.

## Kết quả nghiệm thu (2026-10-04)

| Hạng mục | Kết quả |
|---|---|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Sạch |
| Unit + component test (Vitest) | 243 test pass. Độ phủ: 96% dòng, 90% nhánh |
| E2E (Playwright, `PW_CHANNEL=chrome`) | 20/20 pass |
| Không tràn ngang | 320/768/1024/1440 × sáng/tối × 10 trang |
| Accessibility | axe WCAG 2.1 AA sạch trên 10 trang × 2 theme, cộng thêm sửa focus/live region theo review |

**Khác kế hoạch:**
- Chữ Hán dùng font hệ thống thay vì Noto Sans SC.
- Phím tắt flashcards theo kiểu Quizlet: ←/→ dùng để đánh dấu khi đang theo dõi tiến độ.
- Đảo mặt thẻ thì đổi cả ngôn ngữ và xóa phiên âm.
- Ô tìm kiếm ở header ẩn khi đang ở trang Thư viện.
- E2E dùng `PW_CHANNEL`.

## Kiểm thử

- Unit: `lib/*`, `features/**/lib`, `schemas.ts`, `repository.ts` (độ phủ ≥ 80%).
- Component: LoginForm, RegisterForm, SetEditor, Flashcard, các dạng câu hỏi.
- E2E (Playwright):
  1. Đăng ký → tạo bộ thẻ → flashcards.
  2. Bài kiểm tra 4 dạng.
  3. Ghép thẻ.
  4. AI mock với file `.txt`.
  5. Đổi ngôn ngữ.
  6. Guard khi đã đăng xuất.
- Kiểm tra thủ công trên trình duyệt tích hợp: các breakpoint, light/dark, bàn phím, reduced motion.
