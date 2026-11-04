import { describe, expect, it } from "vitest";

import { getStoragePath } from "./attachmentStorage";

const ORG = "a0000000-0000-0000-0000-000000000000";

describe("getStoragePath", () => {
  it("reads the path from a signed URL so it can be signed again", () => {
    expect(
      getStoragePath(
        `http://127.0.0.1:54321/storage/v1/object/sign/attachments/${ORG}/notes/file.pdf?token=abc`,
      ),
    ).toBe(`${ORG}/notes/file.pdf`);
  });

  it("reads the path from a legacy public URL", () => {
    expect(
      getStoragePath(
        "https://project.supabase.co/storage/v1/object/public/attachments/0.123.png",
      ),
    ).toBe("0.123.png");
  });

  it("decodes encoded characters in the path", () => {
    expect(
      getStoragePath(
        `https://project.supabase.co/storage/v1/object/sign/attachments/${ORG}/shared/my%20logo.png?token=abc`,
      ),
    ).toBe(`${ORG}/shared/my logo.png`);
  });

  it("ignores URLs that are not in the attachments bucket", () => {
    expect(getStoragePath("https://favicon.show/example.com")).toBeUndefined();
    expect(getStoragePath("/logos/reentry-logo-light.svg")).toBeUndefined();
    expect(getStoragePath("data:image/png;base64,AAAA")).toBeUndefined();
    expect(
      getStoragePath(
        "https://project.supabase.co/storage/v1/object/public/other-bucket/file.png",
      ),
    ).toBeUndefined();
    expect(getStoragePath(undefined)).toBeUndefined();
  });
});
