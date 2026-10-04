import { expect, it, vi } from "vitest";
import { presignUpload } from "@/server/ai/storage";

vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    S3_ENDPOINT: "https://project.supabase.co/storage/v1/s3",
    S3_REGION: "ap-southeast-1",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
    S3_BUCKET: "uploads",
  }),
}));

it("presigns browser uploads without a precomputed body checksum", async () => {
  const id = "0190f3a0-0000-7000-8000-000000000000";
  const url = new URL(await presignUpload(id, `uploads/${id}`, 1234, "application/pdf"));
  expect(url.origin).toBe("https://project.supabase.co");
  expect(url.pathname).toBe(`/storage/v1/s3/uploads/uploads/${id}`);
  const params = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  expect(params.some((key) => key.startsWith("x-amz-checksum"))).toBe(false);
  expect(params).not.toContain("x-amz-sdk-checksum-algorithm");
  expect(url.searchParams.get("X-Amz-Credential")).toContain("/ap-southeast-1/s3/");
});
