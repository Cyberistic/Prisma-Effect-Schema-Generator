import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";

/**
 * End-to-end tests: run `prisma generate` against a real `schema.prisma`
 * with the generator wired in two different ways:
 *
 *   1. Explicit path: `provider = "node ./node_modules/.../dist/index.js"`
 *   2. Package name: `provider = "prisma-effect-schema-generator"`
 *
 * The package-name form is the one users copy from the README, and it
 * requires the package to have a `bin` entry in `package.json`. This is
 * the most common failure mode, so we test both.
 */

const DIRECT_PROVIDER = `node ${join(process.cwd(), "dist/index.js").replace(/\\/g, "/")}`;

const SCHEMA_TEMPLATE = (provider: string) => `
generator effect_client {
  provider = "${provider}"
  output   = "./generated/effect-schemas/index.ts"
}

datasource db {
  provider = "sqlite"
}

model User {
  id    String  @id
  email String  @unique
  name  String?
  age   Int?
  role  Role
}

enum Role {
  ADMIN
  USER
  GUEST
}

model Post {
  id          String    @id
  title       String
  body        String?
  authorId    String
  publishedAt DateTime?
  tags        Json?
}
`;

function runPrisma(dir: string): void {
  execFileSync("npx", ["prisma", "generate"], {
    cwd: dir,
    stdio: "pipe",
    env: { ...process.env, npm_config_yes: "true" },
  });
}

function assertOutput(dir: string): void {
  const out = join(dir, "generated/effect-schemas/index.ts");
  expect(existsSync(out)).toBe(true);
  const content = readFileSync(out, "utf8");
  expect(content).toContain("export const UserSchema = Schema.Struct({");
  expect(content).toContain("export const PostSchema = Schema.Struct({");
  expect(content).toContain('import { Schema } from "effect"');
  expect(content).toContain('Schema.Literal("ADMIN")');
  expect(content).toContain('Schema.Literal("GUEST")');
  expect(content).toContain("ALL_MODEL_NAMES");
  expect(content).toContain("ModelName");
}

describe("end-to-end: prisma generate", () => {
  let dir: string;

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  describe("provider = explicit node path", () => {
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "prisma-effect-e2e-direct-"));
      writeFileSync(join(dir, "schema.prisma"), SCHEMA_TEMPLATE(DIRECT_PROVIDER));
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "e2e-direct", version: "0.0.0", private: true }),
      );
    });

    it("writes the generated schema file", () => {
      runPrisma(dir);
      assertOutput(dir);
    });
  });

  describe("provider = package name", () => {
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "prisma-effect-e2e-pkg-"));
      writeFileSync(
        join(dir, "schema.prisma"),
        SCHEMA_TEMPLATE("prisma-effect-schema-generator"),
      );
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "e2e-pkg", version: "0.0.0", private: true }),
      );
      // Make sure the consuming app has the package installed so the
      // `provider` string resolves to a real `node_modules/.bin` entry.
      execFileSync("npm", ["install", process.cwd(), "--no-save"], {
        cwd: dir,
        stdio: "pipe",
      });
    });

    it("writes the generated schema file", () => {
      runPrisma(dir);
      assertOutput(dir);
    });
  });

  it("the generated file imports and validates with effect", async () => {
    dir = mkdtempSync(join(tmpdir(), "prisma-effect-e2e-validate-"));
    writeFileSync(join(dir, "schema.prisma"), SCHEMA_TEMPLATE(DIRECT_PROVIDER));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "e2e-validate", version: "0.0.0", private: true }),
    );
    runPrisma(dir);

    const out = join(dir, "generated/effect-schemas/index.ts");
    const mod = (await import(pathToFileURL(out).href)) as Record<string, unknown>;
    const { Schema } = await import("effect");

    const UserSchema = mod["UserSchema"];
    expect(UserSchema).toBeDefined();
    const decode = (Schema.decodeUnknownSync as unknown as (s: typeof UserSchema) => (a: unknown) => unknown)(UserSchema);

    const valid = decode({
      id: "u1", email: "a@b.c", name: null, age: null, role: "ADMIN",
    });
    expect(valid).toEqual({
      id: "u1", email: "a@b.c", name: null, age: null, role: "ADMIN",
    });

    let enumThrew = false;
    try {
      decode({ id: "u1", email: "a@b.c", name: null, age: null, role: "OWNER" });
    } catch {
      enumThrew = true;
    }
    expect(enumThrew).toBe(true);

    const PostSchema = mod["PostSchema"];
    const decodePost = (Schema.decodeUnknownSync as unknown as (s: typeof PostSchema) => (a: unknown) => unknown)(PostSchema);
    const validPost = decodePost({
      id: "p1", title: "hi", body: null, authorId: "u1", publishedAt: null, tags: ["a", "b"],
    });
    expect(validPost).toEqual({
      id: "p1", title: "hi", body: null, authorId: "u1", publishedAt: null, tags: ["a", "b"],
    });
  });
});