# SiroQuizz

Web app học từ vựng kiểu Quizlet: flashcard, bài kiểm tra với dạng câu hỏi tự chọn, 4 trò chơi, và tạo bộ thẻ bằng AI từ tài liệu tải lên. Giao diện có 3 ngôn ngữ: Tiếng Việt, 中文, English.

Tạo thẻ AI đọc toàn bộ tài liệu trong ngân sách văn bản trích xuất và giữ tối đa 200 thẻ. Xem [giới hạn tài liệu hiện tại](specs/ai-document-limits.md).

> **Phase 2–3 đã triển khai và nghiệm thu local HTTP/Groq thật.** App dùng Postgres, Better Auth và AI generation qua Groq. Phase4 đang được triển khai. Xem [`specs/state.md`](specs/state.md) để tiếp tục.

## Chạy dự án

Cần Node 20.9+ và pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

Sau đó mở http://localhost:3000, đăng ký tài khoản, mở email xác minh trong Mailpit http://localhost:8025 (3 bộ thẻ mẫu sẽ được tạo sẵn).

## Chuẩn bị backend Phase 2

Nếu chưa có `.env.local`, sao chép `.env.example` thành `.env.local`. Next.js **không đọc `.env.example`**. Dùng `NEXT_PUBLIC_DATA_SOURCE=http`, tạo `BETTER_AUTH_SECRET` ngẫu nhiên ít nhất 32 ký tự và đặt `BETTER_AUTH_URL=http://localhost:3000`. `DEPLOYMENT_ENV=local` cho phép SMTP/local rate limit khi chạy production bundle trên máy. Chạy `pnpm services:up`, rồi `pnpm db:migrate` trước `pnpm dev`.

Khóa Groq dùng đúng tên `GROQ_LLM_API`, chỉ đặt trong `.env.local`, không thêm tiền tố `NEXT_PUBLIC_`. Khóa hiện có đã được chuyển từ template sang `.env.local`; HTTP mode dùng Groq thật, còn local mode giữ mock. Model/schema/eval đã cập nhật trong spec Phase3.

```bash
pnpm services:up
```

Lệnh này khởi động PostgreSQL 17 ở `localhost:5433` và Mailpit (SMTP `localhost:1025`, hộp thư http://localhost:8025). Volume giữ dữ liệu khi chạy `pnpm services:down`. Thông tin kết nối Postgres local nằm trong template. Schema/migration và email xác minh/reset đã hoạt động.

Server kiểm tra biến môi trường khi khởi động. HTTP mode yêu cầu `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (ít nhất 32 ký tự). Production HTTP còn yêu cầu HTTPS, Resend và Upstash. Google OAuth là tùy chọn nhưng cần cả ID lẫn secret. Thông báo cấu hình sai chỉ chứa tên biến, không chứa giá trị secret.

CI chạy lint, typecheck, unit coverage, integration Postgres và E2E HTTP qua Mailpit. `pnpm test:integration --coverage` dùng database `siroquizz_test` (hoặc `TEST_DATABASE_URL` kết thúc `_test`), tách khỏi dữ liệu dev.

## Lệnh

| Lệnh                        | Mô tả                                                |
| --------------------------- | ---------------------------------------------------- |
| `pnpm dev`                  | Chạy dev server                                      |
| `pnpm build` / `pnpm start` | Build và chạy bản production                         |
| `pnpm lint`                 | ESLint                                               |
| `pnpm typecheck`            | Kiểm tra kiểu TypeScript                             |
| `pnpm test`                 | Unit test (Vitest)                                   |
| `pnpm test:coverage`        | Unit test kèm độ phủ (ngưỡng 80%)                    |
| `pnpm e2e`                  | E2E Playwright (tự build và chạy server ở cổng 3100) |

Để chạy E2E bằng Google Chrome đã cài sẵn trên máy (không cần tải Chromium của Playwright):

```bash
PW_CHANNEL=chrome pnpm e2e
```

Ảnh chụp màn hình các breakpoint (320 / 768 / 1024 / 1440, sáng và tối) được lưu ở `test-results/screens/`.

## Cấu trúc

```
src/app/            route theo nhóm (marketing) (auth) (app) (study)
src/components/     ui/ (primitive) và layout/ (header, sidebar, …)
src/features/<x>/   components, hooks.ts, repository.ts, schemas.ts, lib/ (logic thuần, có test)
src/lib/            storage, types, normalize, random, data-provider, …
messages/           vi.json, en.json, zh.json
specs/              kế hoạch theo phase
tests/e2e/          Playwright
```

Luồng dữ liệu là `component → hook (TanStack Query) → repository`. Phase 2 chỉ cần thay phần cài đặt repository trong `src/lib/data-provider.tsx` bằng bản gọi API (xem [`specs/architecture.md`](specs/architecture.md)).
