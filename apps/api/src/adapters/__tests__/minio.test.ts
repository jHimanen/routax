import { beforeAll, describe, expect, it } from "vitest";
import { MinioStorageProvider } from "../MinioStorageProvider.js";

describe("MinioStorageProvider", () => {
  let provider: MinioStorageProvider;

  beforeAll(() => {
    provider = new MinioStorageProvider();
  });

  it("round-trips an object through MinIO", async () => {
    const key = `test/${Date.now()}.txt`;
    const content = Buffer.from("routax integration test content");

    const ref = await provider.putObject(key, content, "text/plain");
    expect(ref.key).toBe(key);
    expect(ref.size).toBe(content.length);

    const retrieved = await provider.getObject(key);
    expect(retrieved).toEqual(content);
  });

  it("generates a signed URL containing the key", async () => {
    const key = `test/signed-${Date.now()}.txt`;
    await provider.putObject(key, Buffer.from("signed"), "text/plain");

    const url = await provider.getSignedUrl(key, 60);
    expect(url).toContain(key);
  });

  it("deletes an object", async () => {
    const key = `test/delete-${Date.now()}.txt`;
    await provider.putObject(key, Buffer.from("to delete"), "text/plain");
    await provider.deleteObject(key);

    await expect(provider.getObject(key)).rejects.toThrow();
  });
});
