import { describe, expect, it } from "vitest";
import { isMultipartContentType } from "@/lib/import-request";

describe("import request content type detection", () => {
  it("accepts multipart uploads with a boundary", () => {
    expect(isMultipartContentType("multipart/form-data; boundary=abc")).toBe(true);
  });

  it("routes JSON import previews to the JSON parser", () => {
    expect(isMultipartContentType("application/json")).toBe(false);
    expect(isMultipartContentType(null)).toBe(false);
  });
});
