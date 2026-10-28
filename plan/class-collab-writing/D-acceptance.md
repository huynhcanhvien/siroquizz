# Phần D — Nghiệm thu & kiểm chứng (gói WP5 §6, WP6 §1–5)

**Trạng thái WP6:** review — §1 xanh, §4 review xong (MEDIUM đã sửa, phần còn lại ở `specs/phase-7-collab-writing.md` §Review WP6); §2 kịch bản tay và §3 số liệu chưa làm (cần người).

Đọc `README.md` trước. Chạy sau khi WP1–WP4 đã merge vào `feat/class-collab-writing`.

## 1. Kiểm tra tự động
- `pnpm services:up && DATABASE_URL=<local> pnpm db:migrate` (3 migration mới: M0, M1, M3; M2 nếu có cột AI).
- `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (≥ 80% lines/branches theo `vitest.config.mts`), `pnpm test:integration --coverage`.
- `E2E_PORT=3200 RESEND_API_KEY= PW_CHANNEL=chrome pnpm e2e` (tạm cất `.env.production.local`, xem `specs/state.md`): toàn bộ spec cũ + `class-library.spec.ts` + `writing.spec.ts` xanh.
- axe (WCAG 2.1 AA) + kiểm tra không tràn ngang ở 320/375/768/1024/1440, sáng và tối, cho `/classes/[id]`, `/classes/[id]/writing`, `/sets/[id]` (owner và viewer), `/sets/[id]/propose`, `/folders/[id]` (viewer), `/study/writing/[sessionId]`, `/library?tab=class`.

## 2. Kịch bản tay (3 trình duyệt: giáo viên, học sinh A, học sinh B)
- Phần B: B10 e2e bước 1–5 bằng tay, thêm: học sinh tắt "Nhận đóng góp" → giáo viên không còn nút đề xuất; 2 giáo viên cùng sửa 1 bộ → người sau nhận thông báo `SET_CHANGED`.
- Phần C: C12 e2e bằng tay; đo request/phút trong DevTools khi gõ (~30/phút) và khi rảnh (~6/phút), khi tab ẩn (0 sau flush); đóng phiên → mọi editor read-only; mở lại → viết tiếp.
- Reload giữa chừng khi offline → nội dung còn; từ vựng tạm còn sau reload và trên thiết bị khác.

## 3. Số liệu trước/sau phần A (ghi vào `specs/state.md`)
| Chỉ số | Cách đo |
|---|---|
| Query của `putProgress` 500 thẻ | logger drizzle trong integration test |
| Payload `GET /api/v1/sets` thư viện 50 bộ × 100 thẻ | kích thước response |
| `cached_tokens` trung bình/job | `pnpm ai:eval` |
| Thời gian CI | GitHub Actions trước/sau A17 |
| Thời gian xoá bộ 500 thẻ có tiến độ | `EXPLAIN ANALYZE` trước/sau A2 |

## 4. Review
- Agent `code-reviewer` trên toàn diff nhánh; sửa CRITICAL/HIGH, cân nhắc MEDIUM.
- Agent `security-reviewer`, tập trung: IDOR trên `class_library_items` / `set_collaborators` / `set_change_requests` / `writing_docs` / `scratch_cards`; leo thang quyền qua `class_teachers` (owner lớp xoá lớp, thành viên rời); `audience=teachers` không rò cho học sinh; kích thước payload sync (`readJson` 96KB, 413); rate limit từng route mới; `baseUpdatedAt` không bypass được; ảnh bộ private qua route ảnh.

## 5. Checklist trước PR vào `main`
- [x] Mọi kiểm tra ở §1 xanh; e2e chạy 2 lần liên tiếp không flaky. (WP6: 138 pass × 2; axe/tràn ngang trang mới ở 375/1440 qua `collab-quality.spec.ts`, chưa chạy 320/768/1024)
- [ ] `specs/state.md` có nhật ký từng gói (timestamp giờ VN) và số liệu §3. (nhật ký có; số liệu §3 chưa đo)
- [x] `specs/phase-7-collab-writing.md` mới: tóm tắt schema, bảng phân quyền (như `phase-5-community.md` §Phân quyền), bảng route, giao thức sync, giới hạn.
- [x] `specs/phase-5-community.md` §5 thêm dòng trỏ sang phase 7; `plan/teams.md` đã đánh dấu thay thế.
- [ ] Ghi chú deploy trong PR (nội dung có sẵn ở `specs/phase-7-collab-writing.md` §Ghi chú deploy; Vercel vẫn build webpack, không có env mới): chạy migration trên Neon **trước** khi merge (`DATABASE_URL=<neon-direct> pnpm db:migrate`); nếu A18 bật Turbopack mà Vercel build lỗi → `vercel.json` `buildCommand: "pnpm build:webpack"`; env mới (nếu có) đặt trên Vercel trước.
- [ ] PR body (người điều phối tạo PR) theo `rules/common/git-workflow.md`: tóm tắt toàn bộ commit, test plan.

## 6. Tài liệu (gói WP5)
- Cập nhật `README.md` repo: mục tính năng (thư viện lớp, cộng tác, viết bài, bộ thẻ tạm), biến env mới nếu có.
- `specs/README.md` bảng lộ trình thêm Phase 7.
