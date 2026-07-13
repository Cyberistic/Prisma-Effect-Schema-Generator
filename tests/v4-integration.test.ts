import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runGenerator } from "../src/generator.js";
import { datamodel, enumField, enumValues, field, model } from "./_fixtures.js";

const FIXTURE_DIR = join(process.cwd(), "tests", "v4-fixture");
const GENERATED_FILE = join(FIXTURE_DIR, "generated", "index.ts");

describe("integration: v4 generated schemas compile and validate with effect v4", () => {
  it("generates v4 schemas and they typecheck", () => {
    if (existsSync(GENERATED_FILE)) rmSync(GENERATED_FILE, { force: true });

    runGenerator({
      output: "./generated/index.ts",
      schemaDir: FIXTURE_DIR,
      datamodel: datamodel([
        model("User", [
          field("id", "String", { isId: true }),
          field("email", "String"),
          field("createdAt", "DateTime"),
          enumField("role", "Role"),
        ]),
      ], [{ name: "Role", values: enumValues("ADMIN", "USER") }]),
      rawConfig: { effectVersion: "v4", standardSchemaV1: "true" },
    });

    // Typecheck the generated file against the fixture's effect v4.
    execSync("npx tsc --noEmit -p tsconfig.json", {
      cwd: FIXTURE_DIR,
      stdio: "inherit",
    });

    expect(existsSync(GENERATED_FILE)).toBe(true);
  });

  it("generated v4 schemas round-trip at runtime", async () => {
    const mod = await import(GENERATED_FILE);
    const UserSchema = mod["UserSchema"] as { readonly "~standard": { validate: (input: unknown) => unknown } };
    const result = UserSchema["~standard"].validate({
      id: "u1",
      email: "a@b.c",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      role: "ADMIN",
    });
    expect(result).toHaveProperty("value");
  });
});
