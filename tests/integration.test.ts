import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerator } from "../src/generator.js";
import { datamodel, enumField, enumValues, field, model } from "./_fixtures.js";
import type { DMMFDatamodelLike } from "../src/types.js";

/**
 * These tests do the full end-to-end loop:
 *
 *   1. Run the generator against a fake datamodel.
 *   2. Write the generated source to a temp `.ts` file.
 *   3. tsx-load the file.
 *   4. Use the runtime `Schema.decodeUnknownSync` from `effect` to
 *      round-trip values and confirm the schemas actually validate.
 *
 * This is what catches "the generated code parses but does nothing
 * sensible" bugs -- e.g. mapping BigInt to Number when the value is
 * actually a bigint, or wrapping a required field in NullOr by mistake.
 */

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "prisma-effect-int-"));
}

async function loadGenerated(
  filePath: string,
): Promise<Record<string, unknown>> {
  // Use a Function() with a require() so we can synchronously evaluate
  // a TS file in-process via tsx (vitest is already running through it).
  const url = pathToFileURL(filePath).href;
  const mod = await import(url);
  return mod as Record<string, unknown>;
}

function expectOk<S, A>(schema: S, value: A): void {
  const decoded = (Schema.decodeUnknownSync as unknown as (s: S) => (a: unknown) => A)(schema)(value);
  expect(decoded).toEqual(value);
}

function expectFail<S>(schema: S, value: unknown): void {
  let threw = false;
  try {
    (Schema.decodeUnknownSync as unknown as (s: S) => (a: unknown) => unknown)(schema)(value);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

describe("integration: round-trip through the effect runtime", () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("validates a basic model with required + optional scalars", async () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("email", "String"),
      field("nickname", "String", { isRequired: false }),
      field("age", "Int", { isRequired: false }),
    ]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const UserSchema = mod["UserSchema"] as Schema.Schema<unknown>;

    expectOk(UserSchema, { id: "u1", email: "a@b.c", nickname: null, age: null });
    expectOk(UserSchema, { id: "u1", email: "a@b.c", nickname: "Ace", age: 42 });
    expectFail(UserSchema, { id: "u1", email: "a@b.c" }); // missing required
    expectFail(UserSchema, {
      id: "u1",
      email: "a@b.c",
      nickname: null,
      age: "not-a-number",
    });
  });

  it("validates a model with all primitive types", async () => {
    const m = model("All", [
      field("s", "String"),
      field("i", "Int"),
      field("f", "Float"),
      field("b", "BigInt"),
      field("d", "Decimal"),
      field("bool", "Boolean"),
      field("dt", "DateTime"),
      field("j", "Json", { isRequired: false }),
      field("bytes", "Bytes", { isRequired: false }),
    ]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const AllSchema = mod["AllSchema"] as Schema.Schema<unknown>;
    const date = new Date("2024-01-01T00:00:00.000Z");

    // Schema.Uint8Array decodes from an array of numbers (JSON-style)
    // and produces a Uint8Array.
    expectOk(AllSchema, {
      s: "x", i: 1, f: 1.5, b: 42n, d: "1.23", bool: true, dt: date, j: null, bytes: null,
    });
    // For bytes: input is an array, output is a Uint8Array -- confirm
    // the decoded type rather than round-trip equality.
    const decoded = (Schema.decodeUnknownSync as unknown as (s: typeof AllSchema) => (a: unknown) => { bytes: Uint8Array | null })(AllSchema)({
      s: "x", i: 1, f: 1.5, b: 42n, d: "1.23", bool: true, dt: date, j: { anything: true }, bytes: [1, 2, 3],
    });
    expect(decoded.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.bytes!)).toEqual([1, 2, 3]);
  });

  it("validates a list field", async () => {
    const m = model("X", [field("tags", "String", { isList: true })]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { tags: ["a", "b", "c"] });
    expectOk(XSchema, { tags: [] });
    expectFail(XSchema, { tags: ["a", 1, "c"] });
  });

  it("validates an optional list as null-or-array", async () => {
    const m = model("X", [field("tags", "String", { isList: true, isRequired: false })]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { tags: null });
    expectOk(XSchema, { tags: ["a"] });
    expectFail(XSchema, { tags: "not-an-array" });
  });

  it("validates an enum field", async () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      enumField("role", "Role"),
    ]);
    const d: DMMFDatamodelLike = datamodel(
      [m],
      [{ name: "Role", values: enumValues("ADMIN", "USER") }],
    );
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: d,
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const UserSchema = mod["UserSchema"] as Schema.Schema<unknown>;

    expectOk(UserSchema, { id: "u1", role: "ADMIN" });
    expectOk(UserSchema, { id: "u1", role: "USER" });
    expectFail(UserSchema, { id: "u1", role: "OWNER" });
  });

  it("validates an optional enum as null-or-union", async () => {
    const m = model("X", [enumField("role", "Role", { isRequired: false })]);
    const d = datamodel([m], [{ name: "Role", values: enumValues("A", "B") }]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: d,
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { role: null });
    expectOk(XSchema, { role: "A" });
    expectFail(XSchema, { role: "C" });
  });

  it("validates an optional enum list", async () => {
    const m = model("X", [
      enumField("roles", "Role", { isList: true, isRequired: false }),
    ]);
    const d = datamodel([m], [{ name: "Role", values: enumValues("A", "B") }]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: d,
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { roles: null });
    expectOk(XSchema, { roles: ["A", "B"] });
    expectFail(XSchema, { roles: ["A", "Z"] });
  });

  it("respects bigIntAs = 'BigInt' (string-encoded)", async () => {
    const m = model("X", [field("b", "BigInt")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: { bigIntAs: "BigInt" },
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    // Schema.BigInt: encoded side is a string, decoded side is a bigint.
    // Input string "42" decodes to a bigint 42n on the other side.
    const decode = (Schema.decodeUnknownSync as unknown as (s: typeof XSchema) => (a: unknown) => { b: bigint })(XSchema);
    expect(decode({ b: "42" }).b).toBe(42n);
    expect(decode({ b: "99999999999999999999" }).b).toBe(99999999999999999999n);
    expectFail(XSchema, { b: "not-a-number" });
    expectFail(XSchema, { b: 42n }); // raw bigint rejected (encoded expects string)
  });

  it("respects bigIntAs = 'BigIntFromSelf' (default, accepts bigint)", async () => {
    const m = model("X", [field("b", "BigInt")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { b: 42n });
    expectOk(XSchema, { b: 0n });
    expectFail(XSchema, { b: "42" }); // string is rejected
    expectFail(XSchema, { b: 42 }); // number is rejected
  });

  it("respects decimalAs = 'Number' (lossy, accepts number)", async () => {
    const m = model("X", [field("d", "Decimal")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: { decimalAs: "Number" },
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { d: 1.23 });
    expectFail(XSchema, { d: "1.23" });
  });

  it("respects dateAs = 'Date' (ISO-string codec)", async () => {
    const m = model("X", [field("dt", "DateTime")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: { dateAs: "Date" },
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    // Schema.Date: encoded side is a string, decoded side is a Date.
    // Input ISO string decodes to a Date.
    const decode = (Schema.decodeUnknownSync as unknown as (s: typeof XSchema) => (a: unknown) => { dt: Date })(XSchema);
    const out = decode({ dt: "2024-01-01T00:00:00.000Z" });
    expect(out.dt).toBeInstanceOf(Date);
    expect(out.dt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expectFail(XSchema, { dt: "not-an-iso-string" });
    expectFail(XSchema, { dt: new Date() }); // raw Date rejected (encoded expects string)
  });

  it("respects dateAs = 'DateFromSelf' (default, accepts Date instance)", async () => {
    const m = model("X", [field("dt", "DateTime")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;

    expectOk(XSchema, { dt: new Date("2024-01-01T00:00:00.000Z") });
    expectFail(XSchema, { dt: "2024-01-01T00:00:00.000Z" }); // raw string rejected
  });

  it("renders valid TypeScript that tsx can import", async () => {
    // Smoke test: ensure the file is at least importable.
    const m = model("X", [field("y", "String")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    expect(typeof mod["XSchema"]).toBe("function"); // Schemas are functions
    expect(mod["ALL_MODEL_NAMES"]).toEqual(["X"]);
  });

  it("emits ALL_MODEL_NAMES and ModelName helpers correctly", async () => {
    const m1 = model("A", [field("x", "String")]);
    const m2 = model("B", [field("x", "String")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m1, m2]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    expect(mod["ALL_MODEL_NAMES"]).toEqual(["A", "B"]);
    // ModelName is a type-only export, so it won't be on the module
    // object at runtime. We just confirm the export *exists* in source.
    const src = readFileSync(join(dir, "out.ts"), "utf8");
    expect(src).toContain('export type ModelName =');
    expect(src).toContain('  | "A"');
    expect(src).toContain('  | "B"');
  });

  it("supports a quoted (reserved-word) field name", async () => {
    const m = model("X", [field("class", "String")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: undefined,
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;
    expectOk(XSchema, { class: "hi" });
    expectFail(XSchema, { class: 1 });
  });

  it("supports standardSchemaV1 output with the Standard Schema validate API", async () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("email", "String"),
      field("age", "Int", { isRequired: false }),
    ]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: { standardSchemaV1: "true" },
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const UserSchema = mod["UserSchema"] as Schema.Schema<unknown> & {
      readonly "~standard": {
        version: number;
        vendor: string;
        validate: (input: unknown) => unknown;
      };
    };

    expect(UserSchema["~standard"]).toBeDefined();
    expect(UserSchema["~standard"].version).toBe(1);
    expect(UserSchema["~standard"].vendor).toBe("effect");

    const result = UserSchema["~standard"].validate({
      id: "u1", email: "a@b.c", age: null,
    });
    expect(result).toEqual({ value: { id: "u1", email: "a@b.c", age: null } });
  });

  it("supports standardSchemaV1 with relationColumns together", async () => {
    const post = model("Post", [
      field("id", "String", { isId: true }),
      field("title", "String"),
      field("authorId", "String"),
      { kind: "object", name: "author", type: "User", isRequired: true, isList: false, relationFromFields: ["authorId"], relationToFields: ["id"] } as never,
    ]);
    const user = model("User", [
      field("id", "String", { isId: true }),
      field("name", "String"),
    ]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([user, post]),
      rawConfig: { standardSchemaV1: "true", relationColumns: "true" },
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const PostAuthorRelationSchema = mod["PostAuthorRelationSchema"] as Schema.Schema<unknown> & {
      readonly "~standard": { version: number; validate: (input: unknown) => unknown };
    };

    expect(PostAuthorRelationSchema["~standard"].version).toBe(1);
    const result = PostAuthorRelationSchema["~standard"].validate({ authorId: "u1" });
    expect(result).toEqual({ value: { authorId: "u1" } });
  });

  it("supports a custom effectImport", async () => {
    const m = model("X", [field("y", "String")]);
    runGenerator({
      output: "./out.ts",
      schemaDir: dir,
      datamodel: datamodel([m]),
      rawConfig: { effectImport: "effect" },
    });
    const mod = await loadGenerated(join(dir, "out.ts"));
    const XSchema = mod["XSchema"] as Schema.Schema<unknown>;
    expectOk(XSchema, { y: "ok" });
  });
});