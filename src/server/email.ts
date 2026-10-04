import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { getServerEnv } from "./env";

const copy = {
  vi: {
    verify: "Xác minh email SiroQuizz",
    reset: "Đặt lại mật khẩu SiroQuizz",
    change: "Xác nhận đổi email SiroQuizz",
    body: "Mở liên kết sau để tiếp tục. Nếu bạn không yêu cầu, hãy bỏ qua email này.",
  },
  en: {
    verify: "Verify your SiroQuizz email",
    reset: "Reset your SiroQuizz password",
    change: "Confirm your SiroQuizz email change",
    body: "Open the following link to continue. If you did not request this, ignore this email.",
  },
  zh: {
    verify: "验证 SiroQuizz 邮箱",
    reset: "重置 SiroQuizz 密码",
    change: "确认更改 SiroQuizz 邮箱",
    body: "请打开以下链接继续。如果不是你发起的请求，请忽略此邮件。",
  },
};
export async function sendAccountEmail(
  to: string,
  url: string,
  kind: "verify" | "reset" | "change",
  locale = "vi",
) {
  const env = getServerEnv();
  const strings = copy[locale as keyof typeof copy] ?? copy.vi;
  const message = {
    from: env.EMAIL_FROM ?? "SiroQuizz <hello@siroquizz.local>",
    to,
    subject: strings[kind],
    text: `${strings.body}\n\n${url}`,
  };
  if (env.RESEND_API_KEY) {
    const result = await new Resend(env.RESEND_API_KEY).emails.send(message);
    if (result.error) throw new Error("Account email delivery failed");
  } else if (env.NODE_ENV !== "production" || env.DEPLOYMENT_ENV === "local") {
    await nodemailer
      .createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false })
      .sendMail(message);
  } else {
    throw new Error("Production email is not configured");
  }
}
