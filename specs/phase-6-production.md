# Phase 6 — Sẵn sàng ra mắt (production)

**Trạng thái:** chưa bắt đầu
**Phụ thuộc:** Phase 2–5 (CI cơ bản đã có từ Phase 2)
**Kết quả:** SiroQuizz chạy ổn định trên hạ tầng production, được giám sát, bảo mật, nhanh, học offline được, SEO tốt cho trang công khai, và tuân thủ quy định về dữ liệu cá nhân.

## Mục tiêu

1. Vận hành tin cậy: có giám sát, cảnh báo, sao lưu, và rollback nhanh.
2. Bảo mật ở mức production: CSP, header bảo mật, quét lỗ hổng, quy trình xử lý sự cố.
3. Đạt ngân sách hiệu năng (Core Web Vitals) trên thiết bị tầm trung và mạng 4G.
4. Tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân (và GDPR nếu có người dùng EU).

## Hạ tầng (đề xuất)

| Thành phần | Dịch vụ |
|---|---|
| Ứng dụng Next.js | Vercel (production + preview cho mỗi PR) |
| Postgres | Neon (có point-in-time restore, branch DB cho preview) |
| Object storage | Cloudflare R2 |
| Rate limit / cache | Upstash Redis |
| Email | Resend (domain riêng, SPF/DKIM/DMARC) |
| Job nền / cron | Vercel Cron, Inngest hoặc QStash (nếu P3 cần) |
| Giám sát lỗi | Sentry (frontend + server, source map) |
| Uptime | Better Stack hoặc UptimeRobot |
| Analytics | Plausible hoặc PostHog (chỉ bật sau khi người dùng đồng ý nếu có cookie) |

Có 3 môi trường: `development` (Docker local), `preview` (mỗi PR, dùng DB branch), `production`.

## Phạm vi

### 1. CI/CD (GitHub Actions)
- Trên mỗi PR, chạy theo thứ tự:
  1. lint
  2. typecheck
  3. unit + coverage gate 80%
  4. integration (Postgres service)
  5. build
  6. E2E Playwright (Chromium, Firefox, WebKit) chạy trên bản preview
  7. Lighthouse CI
- Kiểm tra migration: chạy migration trên DB branch. Migration phá dữ liệu bắt buộc chia 2 bước (expand → contract).
- Merge vào `main` thì deploy production. Rollback bằng tính năng promote deployment cũ của Vercel.
- Bật Dependabot hoặc Renovate. Chạy `pnpm audit` và secret scanning (gitleaks) trong CI.

### 2. Bảo mật
- Thêm CSP có nonce theo từng request, sinh trong `proxy.ts` (Next 16):
  - `script-src 'self' 'nonce-…'`
  - `connect-src` chỉ gồm domain API, Sentry và analytics
  - `img-src 'self' data: <R2 domain>`
  - `frame-ancestors 'none'`
- Các header khác: HSTS (preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (tắt camera và mic, chỉ bật khi cần), `X-Frame-Options: DENY`.
- Rà soát lại OWASP Top 10 bằng agent `security-reviewer`, sửa hết lỗi CRITICAL/HIGH.
- Kiểm thử xâm nhập cơ bản: IDOR, rate limit, upload độc hại, prompt injection, XSS trong nội dung thẻ.
- Quy trình sự cố bảo mật: liên hệ qua `security.txt`, runbook xoay vòng secret, thông báo cho người dùng khi có rò rỉ.

### 3. Giám sát & vận hành
- Sentry gắn tag theo `release` và `userId` (đã hash). Cảnh báo khi tỷ lệ lỗi > 1% trong 5 phút.
- Log có cấu trúc JSON, có `requestId`, không chứa PII hay nội dung tài liệu.
- Dashboard: lỗi, độ trễ p95 của API, chi phí AI theo ngày, số job AI lỗi, số email bị bounce.
- Sao lưu: PITR 7 ngày (Neon) cộng snapshot hằng tuần lưu ngoài. Diễn tập khôi phục mỗi quý.
- Runbook: DB quá tải, AI provider lỗi (công tắc tắt AI và thông báo trên UI), email lỗi.

### 4. Hiệu năng
- Ngân sách:

  | Chỉ số | Mục tiêu |
  |---|---|
  | LCP | < 2.5s |
  | INP | < 200ms |
  | CLS | < 0.1 |
  | FCP | < 1.5s |
  | TBT | < 200ms |
  | JS mỗi trang app (gzip) | < 300KB |
  | JS landing (gzip) | < 150KB |

- Dynamic import cho game và trình soạn khi cần. Ảnh dùng `next/image` (AVIF/WebP). Font chỉ preload đúng weight cần.
- Lighthouse CI chặn PR nếu vượt ngân sách. Có báo cáo Web Vitals thực tế từ người dùng (RUM).

### 5. PWA & học offline
- Có manifest, icon, cài được lên màn hình chính.
- Service worker (Serwist) cache app shell.
- Nút “Tải về để học offline” cho từng bộ thẻ: lưu vào IndexedDB.
- Offline học được Flashcards, Học, Kiểm tra, Trò chơi. Kết quả xếp hàng chờ rồi đồng bộ khi có mạng lại. Xung đột xử lý theo nguyên tắc ghi sau thắng (theo `updatedAt`), riêng review FSRS thì gộp theo thứ tự thời gian.

### 6. SEO
- Trang công khai (`/`, `/explore`, `/s/[slug]`, `/u/[username]`) có tiền tố locale (`/vi`, `/en`, `/zh`) và `hreflang`.
- Metadata động, ảnh OG sinh tự động cho từng bộ thẻ, dữ liệu có cấu trúc schema.org.
- `sitemap.xml` (chỉ bộ thẻ public), `robots.txt`. Trang trong app có `noindex`.

### 7. Pháp lý & quyền riêng tư
- Trang Chính sách quyền riêng tư, Điều khoản sử dụng, Chính sách cookie (3 ngôn ngữ).
- Banner đồng ý cookie chỉ hiện khi có cookie không thiết yếu. Mặc định từ chối.
- **Xuất dữ liệu** (JSON + CSV) và **xóa tài khoản** (xóa vĩnh viễn sau 30 ngày, có email xác nhận) ngay trong Cài đặt.
- Ghi nhận đồng ý khi đăng ký (phiên bản điều khoản, thời điểm). Có quy định riêng cho người dùng dưới 16 tuổi (lớp học).
- Liệt kê bên thứ ba xử lý dữ liệu: Vercel, Neon, Cloudflare, Resend, Anthropic, Sentry.

### 8. Gói trả phí (tùy chọn, quyết định trước khi ra mắt)
- Gói Plus: nhiều lượt AI hơn, không giới hạn thư mục và lớp học, xuất PDF bộ thẻ.
- Thanh toán qua Stripe (quốc tế) cộng một cổng trong nước (VNPay hoặc MoMo), xử lý trạng thái gói bằng webhook.
- Có trang Thanh toán và quản lý gói trong Cài đặt.

## Checklist ra mắt

- [ ] Mọi phase trước đạt Definition of Done.
- [ ] Load test: 500 người dùng đồng thời trên các luồng học, p95 API < 300ms (k6).
- [ ] Đã diễn tập khôi phục backup thành công.
- [ ] Đã review bảo mật, không còn lỗi CRITICAL/HIGH. CSP không có vi phạm trong 7 ngày chạy preview.
- [ ] Lighthouse ≥ 90 (Performance, Accessibility, Best Practices, SEO) cho landing và `/s/[slug]`.
- [ ] Chính sách pháp lý đã đăng. Xuất và xóa dữ liệu hoạt động.
- [ ] Cảnh báo Sentry và uptime đã gửi thử đến kênh trực.
- [ ] Domain, email gửi (SPF/DKIM/DMARC) và SSL đã kiểm tra.
- [ ] Đã chạy beta kín với khoảng 50 người dùng và xử lý phản hồi.

## Thứ tự triển khai

- [ ] 1. Hạ tầng production và môi trường preview, quản lý secret.
- [ ] 2. CI/CD đầy đủ, Lighthouse CI, quét bảo mật.
- [ ] 3. Sentry, log, dashboard, cảnh báo, sao lưu.
- [ ] 4. CSP, header, review bảo mật, kiểm thử xâm nhập cơ bản.
- [ ] 5. Tối ưu hiệu năng theo ngân sách.
- [ ] 6. PWA và học offline.
- [ ] 7. SEO cho trang công khai.
- [ ] 8. Pháp lý, xuất và xóa dữ liệu, consent.
- [ ] 9. (Tùy chọn) Gói trả phí.
- [ ] 10. Beta kín, rồi ra mắt.
