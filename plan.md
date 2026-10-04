# SiroQuizz — Phase 1: Giao diện + mock data

## Context
`/Users/ngaofinn/Documents/SiroQuizz` đang trống. Mục tiêu là một web app học từ vựng kiểu Quizlet, gồm tài khoản, bộ flashcard, bài kiểm tra với dạng câu hỏi do người dùng chọn, trò chơi luyện từ, và tạo bộ thẻ bằng AI từ tài liệu tải lên kèm prompt.
**Phase 1** dựng toàn bộ giao diện, từ đăng ký/đăng nhập đến home và mọi chức năng. Các màn hình phải **chạy được thật trên mock data lưu localStorage**. Đăng nhập và AI generate chỉ giả lập. Lớp dữ liệu nằm sau các interface repository, nên Phase 2 chỉ cần thay phần cài đặt bằng API thật (auth, DB, Claude API) mà không phải viết lại UI.

Các lựa chọn đã chốt với người dùng: Next.js + TS + Tailwind, mock data chạy được, UI 3 ngôn ngữ **Việt / Trung (Giản thể) / Anh**, 4 trò chơi: **Ghép thẻ, Rơi từ, Lật thẻ trí nhớ, Xếp chữ**.

## Stack (phiên bản hiện tại trên npm)
- **Next.js 16.3 (App Router) + React 19.3 + TypeScript strict**, quản lý gói bằng **pnpm**.
- **Tailwind CSS 4.3**, design token định nghĩa bằng CSS variables trong `globals.css` (`@theme`).
- **next-intl 4**: chế độ *không định tuyến theo locale*, locale lưu trong cookie `NEXT_LOCALE`, mặc định `vi`. File dịch đặt ở `messages/{vi,en,zh}.json`.
- **radix-ui** (Dialog, DropdownMenu, Tabs, Switch, Select, Toast, Tooltip) làm primitive headless, style tự làm (không dùng giao diện shadcn mặc định). Icon dùng **lucide-react**, light/dark dùng **next-themes**.
- **TanStack Query 5** bọc các lời gọi repository (ở Phase 2 chỉ đổi repository sang fetch).
- **react-hook-form + zod 4** cho mọi form.
- **Vitest 5 + Testing Library** cho unit/component test, **Playwright 1.63** cho E2E.
- Không dùng thư viện animation. Flip, rơi và rung đều làm bằng CSS transform/opacity, riêng game Rơi từ chạy vòng lặp `requestAnimationFrame`.

## Hướng thiết kế
- Phong cách học tập thân thiện, sáng và thoáng giống Quizlet, nhưng có nhận diện riêng của “Siro”:
  - Màu chính là indigo `oklch(55% 0.22 268)`.
  - Màu nhấn là vàng siro/hổ phách `oklch(80% 0.16 75)`, dùng cho highlight, streak, điểm.
  - Màu ngữ nghĩa: success xanh lá, error đỏ san hô, warning.
  - Nền `oklch(97.5% 0.008 270)`, các surface màu trắng.
- Font: **Be Vietnam Pro** (hỗ trợ dấu tiếng Việt, weight 400/500/700/800) với fallback **Noto Sans SC** cho chữ Hán. Cả hai nạp qua `next/font/google`, đúng giới hạn tối đa 2 family.
- Phân cấp rõ:
  - Tiêu đề display lớn, đậm.
  - Thẻ flashcard to, chữ to ở giữa.
  - Nút chế độ học dạng tile có icon.
  - Radius và độ đổ bóng thay đổi theo tầng (thẻ học nổi hơn card danh sách).
- Trạng thái hover/focus/active được thiết kế riêng: focus ring indigo 2px, nhấn thì scale nhẹ. Hiệu ứng flip 3D chuyển sang crossfade khi `prefers-reduced-motion`.
- Responsive từ 320px: sidebar thu thành drawer trên mobile, thẻ học chiếm toàn chiều rộng.
- Khi code UI sẽ load skill `frontend-design` để giữ chất lượng thị giác.

## Routes
| Nhóm | Đường dẫn | Màn hình |
|---|---|---|
| `(marketing)` | `/` | Landing: hero, minh họa thẻ lật, 4 tính năng, CTA đăng ký |
| `(auth)` | `/login`, `/register`, `/forgot-password` | Form và validate, nút Google/Apple chỉ là UI (toast “sắp ra mắt”) |
| `(app)` (header + sidebar, cần đăng nhập) | `/home` | Lời chào, “Tiếp tục học”, bộ thẻ gần đây, tạo nhanh (thủ công / AI) |
| | `/library` | Thư viện bộ thẻ của tôi, có tìm kiếm, sắp xếp và lọc theo nguồn (thủ công/AI/nhập) |
| | `/sets/new`, `/sets/[id]/edit` | Trình soạn bộ thẻ |
| | `/sets/new/ai` | Tạo bộ thẻ bằng AI (upload + prompt) |
| | `/sets/[id]` | Tổng quan bộ thẻ: tile chế độ học, danh sách thẻ, tiến độ |
| | `/settings` | Hồ sơ, ngôn ngữ, giao diện sáng/tối, đăng xuất |
| `(study)` (thanh trên tối giản, cần đăng nhập) | `/study/[id]/flashcards` | Học thẻ |
| | `/study/[id]/test` | Thiết lập bài kiểm tra → làm bài → kết quả |
| | `/study/[id]/games` | Trung tâm trò chơi |
| | `/study/[id]/games/{match,gravity,memory,scramble}` | 4 trò chơi |

Chế độ học dùng tiền tố `/study/` để tách layout full màn hình khỏi `(app)` mà không đụng segment `sets/[id]`. Việc bảo vệ route làm bằng auth guard phía client trong layout `(app)` và `(study)`, thiếu session thì chuyển về `/login?next=...`.

## Mô hình dữ liệu (`src/lib/types.ts`)
```ts
type LangCode = 'vi' | 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de';
interface User { id; email; displayName; avatarColor; uiLocale; createdAt }
interface Card { id; term; definition; phonetic?: string }   // phonetic: pinyin/IPA tùy chọn
interface StudySet { id; ownerId; title; description; termLang; definitionLang;
  cards: Card[]; source: 'manual' | 'ai' | 'import'; createdAt; updatedAt }
interface CardProgress { setId; cardId; status: 'new' | 'learning' | 'known'; updatedAt }
interface TestResult { id; setId; config: TestConfig; score; total; takenAt }
interface GameScore { id; setId; game: GameKind; score; timeMs; playedAt }
```
Mọi cập nhật đều bất biến: trả về object mới, không mutate.

## Kiến trúc dữ liệu (để Phase 2 thay thế dễ)
- `src/lib/storage.ts`: wrapper localStorage an toàn (try/catch, version key `siroquizz:v1:*`). Dữ liệu đọc ra được parse lại bằng zod, hỏng thì bỏ qua và ghi log.
- `src/features/*/repository.ts`: interface + cài đặt `local*Repository`:
  - `AuthRepository`: register, login, logout, getSession, updateProfile.
  - `SetRepository`: findAll, findById, create, update, delete, duplicate.
  - `ProgressRepository`, `ResultRepository`.
- `src/lib/data-provider.tsx`: React context cung cấp các repository, đặt cùng `QueryClientProvider`. Các hook như `useSets()`, `useSet(id)`, `useCreateSet()`… gọi repository qua TanStack Query.
- Auth giả lập: mật khẩu băm SHA-256 bằng `crypto.subtle`, chỉ để mô phỏng luồng “sai mật khẩu”, kèm chú thích rõ là KHÔNG an toàn và sẽ thay ở Phase 2.
- Khi đăng ký sẽ seed 3 bộ mẫu: Tiếng Anh IELTS cơ bản, HSK1 tiếng Trung có pinyin, và Từ vựng Việt–Anh chủ đề du lịch.

## Cấu trúc thư mục (tổ chức theo feature)
```
src/
  app/ (marketing)/ (auth)/ (app)/ (study)/ layout.tsx globals.css
  components/ui/        Button, IconButton, Input, Textarea, Select, Dialog, Dropdown, Tabs,
                        Switch, Toast, Badge, ProgressBar, Avatar, EmptyState, Skeleton
  components/layout/    AppHeader, Sidebar, MobileNav, UserMenu, LanguageSwitcher, ThemeToggle,
                        StudyTopBar, AuthGuard
  features/
    auth/               LoginForm, RegisterForm, ForgotPasswordForm, schemas.ts, repository.ts, hooks.ts, seed.ts
    sets/               SetCard, SetEditor, CardRow, ImportDialog, SetOverview, StudyModeTiles,
                        schemas.ts, repository.ts, hooks.ts
    flashcards/         Flashcard, FlashcardDeck, useFlashcardDeck.ts
    test/               TestSetup, QuestionMultipleChoice, QuestionTrueFalse, QuestionWritten,
                        QuestionMatching, TestResults, lib/generate-test.ts, lib/grade.ts
    games/              GamesHub, GameResult, match/, gravity/, memory/, scramble/ (mỗi game: component + lib thuần + hook)
    ai-generate/        UploadDropzone, PromptPanel, GenerationProgress, ReviewGeneratedCards,
                        lib/generator.ts (interface), lib/mock-generator.ts, lib/parse-text.ts
  lib/                  types.ts, storage.ts, id.ts, shuffle.ts, normalize.ts, speech.ts, cn.ts, data-provider.tsx
  i18n/request.ts, i18n/config.ts
messages/vi.json en.json zh.json
tests/e2e/*.spec.ts
```
Mỗi file 200–400 dòng, tối đa 800. Mỗi hàm dưới 50 dòng.

## Đặc tả chức năng

**1. Tài khoản**
- Đăng ký: tên hiển thị, email, mật khẩu ≥8 ký tự, xác nhận mật khẩu, đồng ý điều khoản.
- Đăng nhập: email, mật khẩu, “ghi nhớ”.
- Quên mật khẩu: chỉ có màn hình “đã gửi email”.
- Lỗi hiển thị theo từng field, thông báo đã dịch theo ngôn ngữ đang chọn.

**2. Trình soạn bộ thẻ**
- Các trường: tiêu đề, mô tả, ngôn ngữ thuật ngữ/định nghĩa.
- Danh sách thẻ gồm thuật ngữ, định nghĩa, phiên âm (tùy chọn). Có thể thêm, xóa, đảo thứ tự lên/xuống, và Tab sang dòng mới.
- Nút “Đảo thuật ngữ ↔ định nghĩa”.
- Dialog **Nhập** cho phép dán văn bản, chọn ký tự phân tách giữa thuật ngữ/định nghĩa (tab, phẩy, “ - ”, tùy chỉnh) và giữa các thẻ, có xem trước.
- Validate: tối thiểu 2 thẻ, không có thẻ rỗng.

**3. Flashcards**
- Thẻ lớn lật 3D, phím `Space` để lật, `←/→` để chuyển thẻ.
- Có xáo trộn, chọn mặt trước (thuật ngữ/định nghĩa) và nút đọc phát âm qua Web Speech API theo `termLang`/`definitionLang`.
- Chế độ phân loại “Đã biết / Đang học”: vuốt hoặc bấm, cập nhật `CardProgress`, cuối vòng có màn tổng kết và nút “Học lại thẻ chưa thuộc”.

**4. Bài kiểm tra (người dùng tự chọn dạng câu hỏi)**
- Màn thiết lập:
  - Số câu (giới hạn bởi số thẻ).
  - Trả lời bằng thuật ngữ / định nghĩa / cả hai.
  - Checkbox các dạng: **Trắc nghiệm, Đúng/Sai, Tự luận (gõ đáp án), Ghép nối**.
- `generate-test.ts` là hàm thuần nhận `(cards, config, rng)` và trả về danh sách câu hỏi.
  - Đáp án nhiễu lấy từ thẻ khác.
  - Bộ thẻ ít hơn 4 thẻ thì trắc nghiệm giảm số lựa chọn.
  - Câu ghép nối gom tối đa 5 cặp.
- `grade.ts` chấm tự luận bằng cách chuẩn hóa: bỏ khoảng trắng thừa, không phân biệt hoa/thường, bỏ dấu câu, giữ dấu tiếng Việt. Có nút “Tôi đã đúng” để ghi đè.
- Màn kết quả: % điểm (vòng tròn tiến độ), danh sách câu sai kèm đáp án đúng, nút làm lại / làm lại câu sai. Kết quả lưu vào `TestResult`.

**5. Trò chơi**
- **Ghép thẻ**: lưới 12 ô (6 cặp), bấm 2 ô để ghép, có đồng hồ, ghép sai cộng 1s phạt. Lưu kỷ lục thời gian tốt nhất.
- **Rơi từ**: định nghĩa rơi từ trên xuống bằng `transform: translateY` theo vòng `rAF`, người chơi gõ thuật ngữ. Có 3 mạng, tốc độ tăng theo level, nút tạm dừng. Từ bị trượt được ôn lại ở cuối.
- **Lật thẻ trí nhớ**: lật từng cặp úp, tìm cặp thuật ngữ–định nghĩa khớp nhau. Đếm lượt và thời gian.
- **Xếp chữ**: xáo các grapheme của thuật ngữ (dùng `Intl.Segmenter` nên đúng với cả chữ Việt có dấu và chữ Hán), bấm/kéo để sắp lại, có gợi ý định nghĩa. Chuỗi xáo luôn khác chuỗi gốc khi có thể.
- Logic mỗi game là hàm thuần trong `lib/`: tạo bàn chơi, kiểm tra cặp, chấm điểm. UI chỉ hiển thị. Có `GameResult` chung (điểm, thời gian, chơi lại, chọn game khác).

**6. Tạo bộ thẻ bằng AI (giả lập)**
- Dropzone nhận file PDF, DOCX, TXT, MD, CSV, PNG, JPG, tối đa 10MB, validate cả loại lẫn kích thước.
- Ô prompt tối đa 1000 ký tự, có các gợi ý mẫu bấm chọn được (“Trích 20 từ vựng HSK2 kèm pinyin”…).
- Tùy chọn: số thẻ, ngôn ngữ thuật ngữ/định nghĩa, có phiên âm hay không.
- Interface `CardGenerator.generate({ files, prompt, options, signal })`. Bản mock xử lý như sau:
  - TXT/MD/CSV: đọc nội dung thật và parse các dòng dạng cặp.
  - File khác: trả bộ thẻ mẫu khớp ngôn ngữ đã chọn.
  - Giả lập 4 bước tiến độ (Đọc tài liệu → Phân tích → Tạo thẻ → Hoàn tất) và cho phép hủy.
- Màn xem lại cho sửa, xóa, bỏ chọn từng thẻ rồi lưu thành bộ thẻ với `source: 'ai'`.

**7. Đa ngôn ngữ & giao diện**
- `LanguageSwitcher` (VI / 中文 / EN) đặt ở header và trang auth, ghi cookie rồi `router.refresh()`.
- Mọi chuỗi UI nằm trong file `messages`, không hardcode trong component.
- Có light/dark, mỗi theme có bộ token riêng.

## Thứ tự triển khai (theo TDD cho phần logic)
1. Scaffold: `create-next-app` (TS, Tailwind, ESLint, App Router, `src/`), Prettier, Vitest, Playwright, design tokens, font, next-intl, providers.
2. `components/ui` + layout (header, sidebar, mobile nav, language switcher, theme toggle).
3. `lib/storage`, các repository + test → auth (form, guard, seed) → landing.
4. Sets: home, library, trình soạn + dialog nhập, trang tổng quan.
5. Flashcards.
6. Test: viết test `generate-test`/`grade` trước, rồi đến UI.
7. Games: viết test logic từng game trước, rồi đến UI.
8. AI generate (mock).
9. Settings, empty/loading/error state, rà lại 3 bản dịch.
10. E2E + kiểm tra responsive và a11y. Chạy agent `code-reviewer`, sửa lỗi CRITICAL/HIGH.

## Verification
- `pnpm lint && pnpm tsc --noEmit && pnpm build` không lỗi.
- `pnpm test --coverage`: ≥80% cho `src/lib`, `src/features/**/lib`, `repository.ts`, `schemas.ts`.
- `pnpm exec playwright test` chạy các luồng:
  1. Đăng ký → thấy 3 bộ mẫu → tạo bộ mới 4 thẻ → lật thẻ.
  2. Làm bài kiểm tra trộn 4 dạng → xem kết quả.
  3. Chơi Ghép thẻ đến khi xong.
  4. AI generate với file `.txt` → lưu → bộ thẻ xuất hiện trong thư viện.
  5. Đổi ngôn ngữ sang 中文 và EN → chuỗi UI đổi theo.
  6. Đăng xuất → vào `/home` bị chuyển về `/login`.
- Chạy `pnpm dev`, mở bằng trình duyệt tích hợp (preview) để kiểm tra trực quan:
  - Các breakpoint 320 / 768 / 1024 / 1440, cả light lẫn dark.
  - Điều hướng bằng bàn phím trong flashcards và game.
  - Bật `prefers-reduced-motion`.
  - Không bị cuộn ngang.
