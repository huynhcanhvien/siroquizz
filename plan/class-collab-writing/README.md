# Kế hoạch: Thư viện lớp + cộng tác bộ thẻ · Phiên viết bài trực tuyến · Tối ưu pipeline

**Lập lúc:** 2026-10-29 · **Trạng thái:** đang làm (xem bảng Trạng thái bên dưới)
**Thay thế:** `plan/teams.md` (lớp học đã làm ở Phase 5; cộng tác làm ở kế hoạch này)
**Cách dùng:** mỗi agent nhận `README.md` này + đúng một file phần (`A-pipeline.md`, `B-class-library.md`, `C-writing.md`, `D-acceptance.md`) + `AGENTS.md` của repo. Không đọc phần khác trừ chỗ được tham chiếu.

## Trạng thái gói việc

Ký hiệu: `todo` · `in-progress` · `review` · `done` · `blocked`. Chi tiết từng mục (A1, B3, C6…) đánh dấu ngay trong file phần tương ứng, dòng `**Trạng thái:**` dưới tiêu đề mục. Agent chỉ sửa trạng thái các mục thuộc gói của mình; bảng dưới do người điều phối cập nhật khi merge.

| Gói | Người làm | Nhánh | Trạng thái | Ghi chú |
|---|---|---|---|---|
| WP1 Nền tảng (A1–A6) | Agent 1 (Opus 5.5) | `wp1-wp3-*` (worktree) | done | merged vào nhánh tích hợp (584c11e); migration 0016 |
| WP3 Thư viện lớp + cộng tác (B1–B10) | Agent 1 (Opus 5.5) | nối tiếp WP1 | done | merged (584c11e); migration 0017 |
| WP2 AI pipeline (A7–A13) | Agent 2 (Opus 5.5) | `wp2-wp4-*` (worktree) | in-progress | |
| WP4 Viết bài (C1–C13) | Agent 2 (Opus 5.5) | nối tiếp WP2 | todo | stub `publishToClass` tới khi WP3 merge |
| WP5 CI/dọn dẹp/tài liệu (A14–A19) | Agent 3 (Opus 5.5) | `wp5-cleanup-ci` (worktree) | in-progress | bắt đầu sau WP1+WP3; merge sau WP2/WP4 |
| WP6 Review & nghiệm thu (D) | — | — | todo | |

## Bối cảnh

SiroQuizz đã có lớp học (`classes`, `class_members` owner|teacher|student, `class_sets` = giáo viên giao bộ của chính mình kèm hạn chót), chia sẻ bộ thẻ theo link/public, thư mục cá nhân, kiểm duyệt. Nhưng:

- Học sinh **không** đưa được bộ thẻ/thư mục của mình vào lớp; chỉ giáo viên giao bộ của giáo viên.
- Mọi đường sửa bộ thẻ khoá cứng vào chủ sở hữu (`requireOwnedSet` ở `src/server/services/sets.ts:42`); không có cộng tác viên, không có "đề xuất sửa chờ duyệt".
- Không có tính năng viết bài; app không có editor rich-text, không có realtime (AI job dùng vòng lặp client gọi `step` ở `src/features/ai-generate/lib/api-generator.ts:100-162`; chỉ 1 chỗ `refetchInterval` ở `src/features/admin/hooks.ts`).
- Audit pipeline (2026-10-29) tìm ra 18 vấn đề có bằng chứng, liệt kê ở `A-pipeline.md`.
- Production: **Vercel Hobby (free)** + Neon Postgres (pooler, `postgres(url, { max: 1, prepare: false })`) + Upstash Redis (REST, chỉ rate-limit).

## Quyết định đã chốt với người dùng (2026-10-29)

| # | Quyết định |
|---|---|
| 1 | Editor viết bài: **Quill 2 + Yjs + y-quill**, nạp động chỉ ở route viết bài. |
| 2 | Màu chữ **theo vai trò, tự động**: tác giả = màu chữ thường; giáo viên = `--danger`; bạn cùng lớp = `--accent-text`. Toolbar vẫn có đổi màu/highlight thủ công. |
| 3 | **Mọi thành viên xem được bộ đều gửi được đề xuất sửa**; chủ bộ có công tắc "Nhận đóng góp" (`study_sets.accepts_contributions` bool default true). |
| 4 | Tối ưu pipeline **xen kẽ trong cùng nhánh** `feat/class-collab-writing`, commit theo từng bước, PR vào `main`. |
| 5 | Giáo viên luôn thấy mọi thứ chia sẻ vào lớp; học sinh khác chỉ thấy khi audience = cả lớp. Không cần duyệt share. |
| 6 | Realtime = polling ngắn với state vector/version, thích ứng, dừng khi tab ẩn. Không thêm vendor realtime. |

## Ràng buộc hạ tầng (Vercel Hobby) — áp dụng cho mọi gói

- Không WebSocket; không giữ SSE. Route API dùng `runtime = "nodejs"`, `maxDuration ≤ 60`.
- Cron chỉ `/api/cron/cleanup` hằng ngày (`vercel.json`): mọi dọn dẹp theo phút phải lazy trong request.
- Ngân sách invocation: 30 học sinh × 45 phút < ~50k request/phiên viết bài.
- JS mới không vào bundle chung (`next/dynamic` với `ssr:false` trong client component). App page < 300kb gz.
- Neon pooler: transaction ngắn, `for update` chỉ quanh merge/ghi.
- Next.js 16 có breaking changes: đọc `node_modules/next/dist/docs/` khi cần (xem `AGENTS.md`).

## Quy ước chung cho mọi gói

- TDD: test trước. Mỗi gói kết thúc bằng `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm test:integration` xanh, rồi tự gọi agent `code-reviewer` và sửa CRITICAL/HIGH.
- Hàm < 50 dòng, file < 800 dòng, bất biến, không `console.log`.
- Migration: `pnpm db:generate` (drizzle-kit) sinh số kế tiếp sau `drizzle/0015_gray_sabretooth.sql`; migrate local phải truyền `DATABASE_URL` local tường minh (xem `specs/state.md`). Mỗi gói **một** migration, chỉ thêm.
- i18n: mọi chuỗi vào `messages/{vi,en,zh}.json`; `messages/messages.test.ts` ép parity key và placeholder, `vi` là chuẩn.
- Mã lỗi mới: thêm cuối `REPOSITORY_ERROR_CODES` ở `src/lib/repository-error.ts` + `errors.<CODE>` 3 ngôn ngữ.
- Local mode (`NEXT_PUBLIC_DATA_SOURCE=local`) không có tính năng mới: UI gate `=== "http"`, page `notFound()` như `/classes`.
- Cập nhật `specs/state.md` (nhật ký có timestamp, giờ VN) khi gói xong.

## Gói việc, thứ tự và phân công agent

Nhánh tích hợp `feat/class-collab-writing` tách từ `main`. Mỗi gói làm trên nhánh con tách từ nhánh tích hợp (hoặc `git worktree`), PR nhỏ vào nhánh tích hợp theo thứ tự; cuối cùng một PR vào `main`.

| Gói | Nội dung | File phần | Agent nên dùng | Phụ thuộc | Song song với |
|---|---|---|---|---|---|
| **WP1 Nền tảng** | A1–A6 + migration M0 | `A-pipeline.md` §M0 | 1 agent backend (general-purpose + `tdd-guide`), hiểu Drizzle/Postgres | — | không (phải xong trước) |
| **WP2 AI pipeline** | A7–A13 + migration M2 | `A-pipeline.md` §M2 | 1 agent backend AI (đọc `specs/ai-document-limits.md`, `evals/`), chạy `pnpm ai:eval` trước/sau | WP1 (tránh xung đột `api.ts`) | WP3 |
| **WP3 Thư viện lớp + cộng tác** | B1–B10 + migration M1 | `B-class-library.md` | 1 agent full-stack; nếu tách: **WP3a** server (B1–B6 + integration test) rồi **WP3b** client (B7–B10) | WP1 | WP2 |
| **WP4 Viết bài** | C1–C13 + migration M3 | `C-writing.md` | 1 agent full-stack có kinh nghiệm Yjs/Quill; nếu tách: **WP4a** server+sync (C2–C6, `ydoc.ts`) và **WP4b** client editor/UI (C7–C10), giao thức C6 là hợp đồng | WP1 (A1), WP3 (`shareToClass`; có thể stub bằng `class_sets` rồi đổi) | WP2 (và WP3 nếu stub) |
| **WP5 CI/dọn dẹp/tài liệu** | A14–A18, ReviewQueue invalidate, `specs/state.md`, `specs/phase-7-collab-writing.md`, ghi chú deploy | `A-pipeline.md` §M4 + `D-acceptance.md` §6 | 1 agent DevOps/docs (`doc-updater` + general) | WP1–WP4 merge xong | — |
| **WP6 Review & nghiệm thu** | `D-acceptance.md` §1–5 | `D-acceptance.md` | `e2e-runner` + `security-reviewer` + `code-reviewer` | WP5 | — |

### Quy ước tránh giẫm chân

- WP2 **không** sửa `access.ts`, `sets.ts`, `community-api.ts`, `progress.ts`, `learning.ts`.
- WP3 và WP4 chỉ **thêm** router mới (`src/server/collab-api.ts`, `src/server/writing-api.ts`) và mỗi bên 1 dòng chain (`community-api.ts:145` cho collab; `src/app/api/v1/[...path]/route.ts:43` cho writing, **trước** `communityApi`).
- `src/server/db/schema.ts`: mỗi gói chỉ **thêm** khối của mình ở cuối file, có comment tên gói.
- `messages/*.json`: mỗi gói thêm namespace riêng (`collab`, `classes.library`, `writing`, …) để merge không xung đột.
- `REPOSITORY_ERROR_CODES`: mỗi gói thêm vào cuối, một dòng một mã.
- WP4 cần `shareToClass` của WP3: nếu WP3 chưa merge, WP4 viết `publishToClass(tx, userId, classId, setId, audience)` gọi `class_sets` (như `assignSet`) và để TODO đổi sang `shareToClass`.

### Mốc commit trên nhánh tích hợp

| Mốc | Nội dung |
|---|---|
| M0 | WP1 |
| M1 | WP3 |
| M2 | WP2 |
| M3 | WP4 |
| M4 | WP5 → WP6 → PR vào `main` (chạy migration trên Neon **trước** khi merge) |
