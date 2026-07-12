import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onGenerate, resolveOutputPath, runGenerator } from "../src/generator.js";
import {
  datamodel,
  defaultOptions,
  enumField,
  enumValues,
  field,
  model,
} from "./_fixtures.js";
import type { DMMFDatamodelLike } from "../src/types.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "prisma-effect-"));
}

describe("resolveOutputPath", () => {
  it("returns the absolute path as-is", () => {
    expect(resolveOutputPath("/tmp/foo.ts", "/anywhere", "./fallback.ts")).toBe(
      "/tmp/foo.ts",
    );
  });

  it("resolves a relative path against the schema directory", () => {
    expect(resolveOutputPath("./out.ts", "/some/schema-dir", "./fallback.ts")).toBe(
      "/some/schema-dir/out.ts",
    );
  });

  it("uses the fallback when output is undefined", () => {
    expect(resolveOutputPath(undefined, "/some/dir", "./fallback.ts")).toBe(
      "/some/dir/fallback.ts",
    );
  });

  it("uses the fallback when output is empty string", () => {
    expect(resolveOutputPath("", "/some/dir", "./fallback.ts")).toBe(
      "/some/dir/fallback.ts",
    );
  });

  it("handles dot-segment paths in the fallback", () => {
    expect(resolveOutputPath(undefined, "/some/dir", "../up.ts")).toBe("/some/up.ts");
  });
});

describe("runGenerator", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes the file to disk at the resolved path", () => {
    const { outputPath } = runGenerator({
      output: "./schemas.ts",
      schemaDir: dir,
      datamodel: datamodel([model("X", [field("y", "String")])]),
      rawConfig: undefined,
    });
    const expected = join(dir, "schemas.ts");
    expect(outputPath).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it("creates nested output directories on demand", () => {
    const { outputPath } = runGenerator({
      output: "./deep/nested/path/out.ts",
      schemaDir: dir,
      datamodel: datamodel([model("X", [field("y", "String")])]),
      rawConfig: undefined,
    });
    expect(existsSync(outputPath)).toBe(true);
  });

  it("writes UTF-8 text exactly matching renderModule output", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("name", "String"),
    ]);
    const { outputPath, code } = runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const onDisk = readFileSync(outputPath, "utf8");
    expect(onDisk).toBe(code);
  });

  it("respects custom config (bigIntAs, decimalAs, dateAs)", () => {
    const m = model("T", [
      field("a", "BigInt"),
      field("b", "Decimal"),
      field("c", "DateTime"),
    ]);
    const { outputPath } = runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: {
        bigIntAs: "BigInt",
        decimalAs: "Number",
        dateAs: "Date",
      },
    });
    const content = readFileSync(outputPath, "utf8");
    expect(content).toContain("a: Schema.BigInt,");
    expect(content).toContain("b: Schema.Number,");
    expect(content).toContain("c: Schema.Date,");
  });

  it("respects effectImport override", () => {
    const { outputPath } = runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([model("X", [field("y", "String")])]),
      rawConfig: { effectImport: "my-effect-lib" },
    });
    const content = readFileSync(outputPath, "utf8");
    expect(content).toContain('import { Schema } from "my-effect-lib"');
  });

  it("respects exportModelNames=false override", () => {
    const { outputPath } = runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([model("X", [field("y", "String")])]),
      rawConfig: { exportModelNames: "false" },
    });
    const content = readFileSync(outputPath, "utf8");
    expect(content).not.toContain("ALL_MODEL_NAMES");
  });

  it("handles an empty datamodel without crashing", () => {
    const { outputPath, code } = runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([]),
      rawConfig: undefined,
    });
    expect(existsSync(outputPath)).toBe(true);
    expect(code).toContain("No models in your schema.prisma");
  });

  it("renders enum fields correctly", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      enumField("role", "Role"),
    ]);
    const d: DMMFDatamodelLike = datamodel([m], [
      { name: "Role", values: enumValues("ADMIN", "USER") },
    ]);
    const { outputPath } = runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: d,
      rawConfig: undefined,
    });
    const content = readFileSync(outputPath, "utf8");
    expect(content).toContain(
      'role: Schema.Union(Schema.Literal("ADMIN"), Schema.Literal("USER"))',
    );
  });

  it("is idempotent: running twice produces the same file", () => {
    const m = model("X", [field("y", "String")]);
    const opts = {
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    };
    const a = runGenerator(opts);
    const b = runGenerator(opts);
    expect(readFileSync(a.outputPath, "utf8")).toBe(
      readFileSync(b.outputPath, "utf8"),
    );
  });
});

describe("onGenerate (Prisma adapter)", () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("calls runGenerator with the right inputs from a Prisma-shaped options object", async () => {
    const m = model("User", [field("id", "String", { isId: true })]);
    const schemaPath = join(dir, "schema.prisma");
    await onGenerate({
      generator: {
        output: { value: "./generated/index.ts" },
        config: { bigIntAs: "BigInt" },
      },
      dmmf: { datamodel: datamodel([m]) },
      schemaPath,
    });
    const expected = join(dir, "generated/index.ts");
    expect(existsSync(expected)).toBe(true);
    const content = readFileSync(expected, "utf8");
    expect(content).toContain("export const UserSchema = Schema.Struct({");
  });

  it("handles missing output by falling back to default", async () => {
    const m = model("X", [field("y", "String")]);
    const schemaPath = join(dir, "schema.prisma");
    await onGenerate({
      generator: {
        output: { value: null },
        config: {},
      },
      dmmf: { datamodel: datamodel([m]) },
      schemaPath,
    });
    // The default fallback path should exist
    const expected = join(dir, "generated/effect-schemas/index.ts");
    expect(existsSync(expected)).toBe(true);
  });

  it("handles undefined output gracefully", async () => {
    const m = model("X", [field("y", "String")]);
    const schemaPath = join(dir, "schema.prisma");
    await onGenerate({
      generator: {
        output: null,
        config: {},
      },
      dmmf: { datamodel: datamodel([m]) },
      schemaPath,
    });
    const expected = join(dir, "generated/effect-schemas/index.ts");
    expect(existsSync(expected)).toBe(true);
  });
});

// Suppress unused-import warnings on `defaultOptions` -- we use it via
// the fixture module.
void defaultOptions;