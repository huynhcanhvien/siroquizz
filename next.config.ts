import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // yjs must load once: a second copy (ESM + CJS) breaks its constructor checks.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "mammoth", "yauzl", "sharp", "yjs"],
};

export default withNextIntl(nextConfig);
