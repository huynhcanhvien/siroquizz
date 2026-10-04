# Phase 3 — Tạo bộ thẻ bằng AI thật

**Trạng thái:** triển khai/nghiệm thu local + Groq thật hoàn tất (2026-10-04). Production R2 lifecycle/CORS còn chờ credentials.
**Phụ thuộc:** Phase 2, Postgres/Better Auth.

## Quyết định đã triển khai

- Dùng khóa server `GROQ_LLM_API` hiện có. Text: `openai/gpt-oss-120b`; phụ trợ: `openai/gpt-oss-20b`; OCR ảnh/PDF scan: `qwen/qwen3.8-27b`. Có biến model riêng và `AI_ENABLED=false` để tắt AI. Giá token theo [Groq models](https://console.groq.com/docs/models), chi phí là ước tính, không phải invoice.
- [Structured outputs strict](https://console.groq.com/docs/structured-outputs) + Zod validation sau inference; input document là dữ liệu không đáng tin trong JSON riêng, system prompt cố định, không có tools. Text thuần, trường ≤1000 ký tự, ≤200 thẻ, dedupe thuật ngữ NFKC. Người dùng xem/sửa trước khi lưu.
- PDF không gửi document block (Groq không có contract Claude PDF). PDF.js trích text, trang scan render thành ảnh rồi [vision OCR](https://console.groq.com/docs/vision). Free tối đa tổng30 trang/job; không có Plus ở phase này.
- DOCX dùng Mammoth sau kiểm tra ZIP entry count≤1000, expanded≤20MB, từng entry≤10MB, cấm encrypted/path traversal. TXT/MD/CSV dùng UTF-8 strict. Nếu không có prompt và toàn bộ tài liệu là cặp rõ ràng, parse trực tiếp, không gọi model.
- Ảnh kiểm tra magic bytes + decode pixel cap40M, resize1800px trước OCR. Upload≤10MB/file, ≤5files/job; PDF/ảnh/DOCX phải đúng chữ ký, không chỉ tin extension/MIME.
- Upload qua signed PUT URL5phút. Production dùng S3-compatible R2 (`S3_*`); local dùng private `.data/uploads` (directory700, files600), chữ ký HMAC gắn id/size/MIME/expiry, owner checks và write-once. File không bao giờ là public/static asset.
- Job lưu Postgres; SSE chạy Node Route Handler maxDuration600s, giới hạn thực thi9phút. Chunk25k ký tự, tối đa3 cuộc gọi song song. Provider retry≤3, exponential backoff + Retry-After≤60s, timeout/cancel có AbortSignal.
- SSE gồm upload phía client, reading/extraction, analyzing, generating(x/y), validating, done/error. Kết quả/historical prompt/options mở lại trong24giờ, private owner-only. Disconnect/cancel dừng provider, completion conditional không tính quota nếu cancel thắng race.
- Quota Postgres transaction + lock user (thay kế hoạch đếm Upstash để reservation/success atomic với job): 5 successful/day, reset00:00 Việt Nam. Queued/running giữ reservation; cancelled/error không trừ; abandoned reservation hết sau10phút. Auxiliary50/day, refund nếu lỗi. Upstash vẫn rate limit API production.
- Tokens/cache-read/cost ước tính ghi ở job, không log body/document/key. Cleanup uploads/jobs24h có trong `pnpm db:cleanup`; cấu hình cron/bucket lifecycle production ở P6, chưa tự cài cron hệ thống trên máy người dùng.

## API và UI đã có

| Method | Đường dẫn | Hành vi |
|---|---|---|
| POST | `/api/v1/ai/uploads` | Validate metadata → signed PUT URL + uploadId |
| PUT | `/api/v1/ai/uploads/:id/file` | Local signed binary upload, bounded bytes + magic check |
| POST | `/api/v1/ai/jobs` | Owner uploads, atomic quota reservation |
| GET | `/api/v1/ai/jobs/:id/stream` | SSE, cancellation signal, owner-only |
| GET | `/api/v1/ai/jobs` | Historical results/options24h |
| POST | `/api/v1/ai/jobs/:id/cancel` | Conditional cancel, no quota charge |
| GET | `/api/v1/ai/quota` | remaining/limit/resetsAt |
| POST | `/api/v1/ai/phonetics` | setId/cards → id + phonetic preview |
| POST | `/api/v1/ai/examples` | Example sentences preview |
| POST | `/api/v1/ai/grade` | expected/answer/lang → correct/reason |

`DataProvider` HTTP dùng `createApiGenerator`, local vẫn mock. AI page ẩn mock badge trong HTTP, hiển thị quota/history. Set overview có preview phiên âm + nút lưu và câu ví dụ. Test setup có semantic grading tùy chọn mặc định tắt; provider lỗi giữ so sánh text. Dịch đầy đủ vi/en/zh.

## Eval và kiểm tra

- [Fixtures](../evals/ai-generation/manifest.json): 21 synthetic copyright-free cases, TXT/CSV/DOCX, 2 ảnh bảng từ, PDF tiếng Trung10trang, PDF HSK2 10trang, injection.
- Chạy `pnpm ai:eval`; `EVAL_RESUME=1` chỉ chạy lại cases chưa đạt (giữ kết quả thành công đã đo). Xóa report nếu đổi prompt/model/fixtures để chạy baseline mới; không dùng resume để kiểm tra hồi quy sau đổi model.
- [Báo cáo thực đo](../evals/ai-generation/latest-report.json): schema100%, count100% (±10%), source term language100%, literal reference accuracy100%, pinyin-present100%, injection0/21. Chi phí successful eval ước tính~$0.0126; không cộng các request thất bại trước đó. Accuracy là literal matching với từ vựng kiểm soát, không thay cho independent human review tài liệu thực tế.
- Unit357 pass, lines97.11%; integration44 pass, lines93.42% (bao gồm services, extraction, provider, storage). Actual PDF10trang/DOCX/ảnh decode tests, rejection oversized/spoofed/invalid UTF8/31pagePDF, HMAC tamper/expiry/replay/path traversal.
- Full E2E28 pass +1 live-provider test intentionally skipped trong suite mặc định. Live Groq Chinese generation E2E đã chạy riêng và pass (5/5 AI flow tests gồm test live). Nghiệm thu UI cuối sau bổ sung validating/progress được ghi trong state.
- Lint/typecheck/build webpack pass. Provider transport tests có strict schema, disable switch, malformed/refused/truncated outputs, 429 delay, abort during retry.
- Review trực tiếp upload/ownership/quota race/cancel/token secrecy; không tuyên bố có subagent review độc lập.

## Checklist

- [x] Storage adapter, local signed upload, magic-byte/size validation.
- [x] Job migration, bounded extraction.
- [x] Groq strict generation, server normalization.
- [x] SSE, HTTP generator, cancellation.
- [x] Chunking/concurrency/deduplication; cache-read usage được ghi (caching do provider quản lý).
- [x] Quota/reservation/rate limiting/cost tracking, UI quota.
- [x] Eval fixtures + measured report.
- [x] Phonetics/examples/semantic grading APIs và UI.
- [x] Security checks, integration/E2E.
- [ ] Production R2 bucket/CORS/lifecycle24h live acceptance (credentials chưa có).

## Giới hạn còn lại

Production cần R2 bucket private, CORS chỉ origin app, cho PUT + Content-Type, lifecycle1day kèm cleanup cron để bảo đảm retention. Không tự triển khai lên tài khoản chưa được cung cấp. Synthetic eval không đảm bảo mọi tài liệu ngoài tập fixture đều chính xác; UI review bắt buộc vẫn giữ. Provider có rate limits theo account, nên jobs có thể error không tính quota dù retry đã chạy.
