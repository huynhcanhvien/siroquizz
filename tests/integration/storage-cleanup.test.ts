import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { cleanupAi } from "@/server/ai/cleanup";
import { deleteStoredObjects } from "@/server/ai/storage";

vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    S3_ENDPOINT: "https://storage.example.test/s3",
    S3_REGION: "ap-southeast-1",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
    S3_BUCKET: "uploads",
  }),
}));

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7(),
  DAY = 86_400_000;

type DeleteInput = { Bucket: string; Delete: { Objects: { Key: string }[]; Quiet: boolean } };
const send = vi.spyOn(S3Client.prototype, "send");
/** Fake S3: every DeleteObjects succeeds except for keys listed in `failing`. */
function fakeS3(failing: string[] = []) {
  send.mockImplementation((async (command: unknown) => {
    if (!(command instanceof DeleteObjectsCommand)) throw new Error("unexpected S3 command");
    const keys = (command.input as DeleteInput).Delete.Objects.map((object) => object.Key);
    return {
      Errors: keys.filter((key) => failing.includes(key)).map((Key) => ({ Key, Code: "Boom" })),
    };
  }) as never);
}
const deleteCalls = () =>
  send.mock.calls.map(([command]) => (command.input as DeleteInput).Delete.Objects.length);
const uploadKeys = async () =>
  (await db.select({ key: schema.aiUploads.key }).from(schema.aiUploads)).map((row) => row.key);
async function insertUpload(expiresAt: Date) {
  const id = v7();
  const [row] = await db
    .insert(schema.aiUploads)
    .values({
      id,
      key: `uploads/${id}`,
      userId: owner,
      name: "a.pdf",
      mime: "application/pdf",
      size: 1,
      expiresAt,
    })
    .returning({ key: schema.aiUploads.key });
  return row.key;
}

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  send.mockReset();
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values({ id: owner, name: "Owner", email: "cleanup@example.com" });
});
afterAll(() => connection.end());

describe("deleteStoredObjects", () => {
  it("deletes in DeleteObjects batches of at most 1000 keys", async () => {
    fakeS3();
    const keys = Array.from({ length: 2500 }, (_, index) => `uploads/key-${index}`);
    expect(await deleteStoredObjects(keys)).toHaveLength(2500);
    expect(deleteCalls()).toEqual([1000, 1000, 500]);
    const first = send.mock.calls[0][0].input as DeleteInput;
    expect(first.Bucket).toBe("uploads");
    expect(first.Delete.Quiet).toBe(true);
  });

  it("returns only the keys S3 reports as deleted and skips empty input", async () => {
    fakeS3(["uploads/b"]);
    expect(await deleteStoredObjects(["uploads/a", "uploads/b", "uploads/c"])).toEqual([
      "uploads/a",
      "uploads/c",
    ]);
    expect(await deleteStoredObjects([])).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("cleanupAi", () => {
  it("removes expired uploads with one S3 batch and one row delete, keeping failures", async () => {
    const now = new Date();
    const expired = await Promise.all(
      [1, 2, 3].map(() => insertUpload(new Date(now.getTime() - DAY))),
    );
    const fresh = await insertUpload(new Date(now.getTime() + DAY));
    fakeS3([expired[1]]);
    expect(await cleanupAi(db, now)).toBe(2);
    expect(deleteCalls()).toEqual([3]);
    expect((await uploadKeys()).sort()).toEqual([expired[1], fresh].sort());
  });
});
