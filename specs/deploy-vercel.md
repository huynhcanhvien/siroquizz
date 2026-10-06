# Deploy SiroQuizz lên Vercel (gói free)

Hướng dẫn chạy app hoàn toàn miễn phí cho nhu cầu cá nhân, quy mô nhỏ. Bạn đã có domain name.

> Tất cả dịch vụ dưới đây đều có **gói free** và (trừ khi ghi chú) **không cần thẻ tín dụng**.
> App giữ nguyên code — chỉ cần tạo dịch vụ và điền biến môi trường.

## 0. Bảo mật trước khi push

- `.env.example` đã được dọn sạch secret. **Hãy rotate** (thu hồi + tạo mới) 2 khóa từng lộ trong file: `GROQ_LLM_API` (Groq) và `RESEND_API_KEY` (Resend).
- Chỉ đặt secret thật trong `.env.local` (đã `.gitignore`) và trong Vercel env.

## 1. Tạo các dịch vụ free

| Dịch vụ | Dùng để | Ghi chú |
|---|---|---|
| **Vercel** (Hobby) | Hosting | Free, non-commercial. |
| **Neon** | Postgres | Free, không thẻ. Lấy **2 connection string**: *pooled* (host có `-pooler`) cho app, *direct* cho migrate. |
| **Upstash Redis** | Rate limit | Free, không thẻ. Lấy `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. |
| **Resend** | Gửi email thật | Free 100 mail/ngày. **Verify domain** (thêm bản ghi DNS SPF/DKIM) để gửi tới *mọi* địa chỉ. |
| **Supabase Storage** | Lưu file upload AI | Free 1GB, không thẻ. Tạo **bucket private**; bật **CORS** cho `PUT` từ domain app. Lấy S3 endpoint + access keys. |
| **Groq** | AI sinh thẻ | Free tier. Dùng `GROQ_LLM_API` (đã rotate). |

> Cloudflare R2 cũng chạy (code tương thích S3) nhưng cần thẻ → dùng Supabase Storage cho tiện.

## 2. Verify domain với Resend (để gửi mail cho mọi user)

1. Resend → **Domains → Add domain** (domain của bạn).
2. Thêm các bản ghi DNS (SPF, DKIM, DMARC) mà Resend cấp vào nhà cung cấp DNS (Cloudflare/Namecheap…).
3. Chờ trạng thái **Verified**. Từ đó `EMAIL_FROM` dùng địa chỉ thuộc domain này, ví dụ `SiroQuizz <no-reply@domain.com>`, và gửi được tới bất kỳ email nào.

## 3. Biến môi trường trên Vercel (Project → Settings → Environment Variables)

```
NEXT_PUBLIC_DATA_SOURCE=http
DEPLOYMENT_ENV=production
DATABASE_URL=<Neon POOLED url>
BETTER_AUTH_URL=https://<domain-cua-ban>
BETTER_AUTH_SECRET=<openssl rand -base64 32>
RESEND_API_KEY=<key mới>
EMAIL_FROM=SiroQuizz <no-reply@domain-da-verify>
UPSTASH_REDIS_REST_URL=<...>
UPSTASH_REDIS_REST_TOKEN=<...>
GROQ_LLM_API=<key mới>
AI_ENABLED=true
S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
S3_REGION=<region của project, vd ap-southeast-1>
S3_BUCKET=<ten-bucket>
S3_ACCESS_KEY_ID=<...>
S3_SECRET_ACCESS_KEY=<...>
CRON_SECRET=<chuỗi ngẫu nhiên, vd openssl rand -hex 32>
TRUSTED_IP_HEADER=x-vercel-forwarded-for
```

`NODE_ENV=production` do Vercel tự đặt. Để trống `GOOGLE_CLIENT_ID/SECRET` nếu chưa dùng Google (nút tự ẩn).

## 4. Deploy

1. Push repo lên GitHub (đã xử lý secret ở bước 0).
2. Vercel → **Import** repo. Build Command đã khai trong `vercel.json` (`pnpm build`); Vercel tự nhận pnpm qua lockfile.
3. Trỏ domain của bạn vào Vercel; đảm bảo `BETTER_AUTH_URL` = chính domain đó (HTTPS, bắt buộc ở production).
4. **Chạy migration vào DB production** (một lần, và mỗi khi có migration mới) — dùng connection string **direct** của Neon:
   ```bash
   DATABASE_URL="<neon-direct-url>" pnpm db:migrate
   ```
5. Cron dọn dữ liệu đã cấu hình trong `vercel.json` (`/api/cron/cleanup`, chạy hằng ngày 18:00 UTC). Vercel tự gửi `Authorization: Bearer $CRON_SECRET`.

## 5. Kiểm tra sau deploy

- Đăng ký tài khoản mới → nhận **mail thật** → bấm link xác minh → vào `/home`.
- Vào `/sets/new/ai`, tạo thẻ bằng AI với một PDF nhiều trang → job chạy qua nhiều bước, không timeout (xem Vercel Function logs: mỗi request `/api/v1/ai/jobs/*/step` < 60s).
- Thử cron: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<domain>/api/cron/cleanup` → 200.
- Function logs không có lỗi kết nối Postgres (đã dùng pooled url).

## Giới hạn của gói free

- Mỗi request serverless tối đa **60s**. App đã chia nhỏ job AI thành nhiều bước ngắn, nhưng tab trình duyệt cần **mở trong lúc sinh thẻ** (giống SSE trước đây). File OCR cực lớn có thể cần nhiều bước; nếu muốn chạy nền/không giữ tab → nâng Vercel **Pro** (maxDuration 300s) hoặc thêm hàng đợi (QStash).
- Neon/Supabase free có thể tạm nghỉ khi không dùng; request đầu sau khi nghỉ hơi chậm.
- Hạn mức AI tính bằng **credit** (1 credit = 1.000 token Groq thực dùng): 20 credit miễn phí/ngày/người (reset 00:00 giờ VN, không cộng dồn) + credit thưởng không hết hạn; tối đa 40 credit/lần tạo; toàn app `AI_GLOBAL_DAILY_CREDITS` (mặc định 480 ≈ 80% hạn mức ngày của key free). Hằng số trong [credits.ts](../src/features/ai-generate/lib/credits.ts).
