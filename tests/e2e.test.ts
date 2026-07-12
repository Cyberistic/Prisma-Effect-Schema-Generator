import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";

/**
 * End-to-end test: actually run `prisma generate` with our generator
 * wired into a real `schema.prisma`. This is the ultimate integration
 * check -- it confirms Prisma can:
 *
 *   1. Resolve our package entry point.
 *   2. Invoke the generatorHandler we registered.
 *   3. Pass the DMMF.
 *   4. Receive a written file.
 *
 * If this test ever fails, the package is broken for real users.
 */

const SCHEMA = `
generator effect_client {
  provider = "node ${join(process.cwd(), "dist/index.js").replace(/\\/g, "/")}"
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

describe("end-to-end: prisma generate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "prisma-effect-e2e-"));
    writeFileSync(join(dir, "schema.prisma"), SCHEMA);
    // Prisma 7 needs a package.json with `"type": "module"` for some
    // features, but plain CommonJS works fine for `prisma generate`.
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "e2e", version: "0.0.0", private: true }),
    );
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes the generated schema file to the configured location", () => {
    execFileSync("npx", ["prisma", "generate"], {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, npm_config_yes: "true" },
    });
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
  });

  it("the generated file actually imports & validates with effect", async () => {
    execFileSync("npx", ["prisma", "generate"], {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, npm_config_yes: "true" },
    });
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

    // enum check
    let enumThrew = false;
    try {
      decode({ id: "u1", email: "a@b.c", name: null, age: null, role: "OWNER" });
    } catch {
      enumThrew = true;
    }
    expect(enumThrew).toBe(true);

    // tags is a Json field, so it accepts any shape
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