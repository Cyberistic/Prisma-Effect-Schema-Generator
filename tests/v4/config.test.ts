import { describe, expect, it } from "vitest";
import { DEFAULTS, resolveOptions } from "../../src/config.js";

describe("config v4", () => {
  it("defaults effectVersion to v3", () => {
    expect(DEFAULTS.effectVersion).toBe("v3");
    expect(resolveOptions({}).effectVersion).toBe("v3");
  });

  it("accepts effectVersion = v4", () => {
    expect(resolveOptions({ effectVersion: "v4" }).effectVersion).toBe("v4");
  });

  it("falls back to v3 for unknown values", () => {
    expect(resolveOptions({ effectVersion: "v5" }).effectVersion).toBe("v3");
    expect(resolveOptions({ effectVersion: "four" }).effectVersion).toBe("v3");
  });
});
