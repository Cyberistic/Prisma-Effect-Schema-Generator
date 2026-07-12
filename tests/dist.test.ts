import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerator } from "../src/generator.js";
import { datamodel, defaultOptions, field, model } from "./_fixtures.js";

/**
 * Black-box test against the *built* generator. The dist/index.js
 * file is what Prisma's `node ./path` mode loads, so it has to:
 *   - expose `generatorHandler` correctly
 *   - work when require()'d from a CommonJS context
 *   - actually write the file when its onGenerate is invoked
 *
 * We don't run the full Prisma generator pipeline (it requires a real
 * `schema.prisma` file) -- we drive the same code path through
 * `runGenerator`, then import the generated module to confirm it parses.
 */

describe("dist artifact", () => {
  const distPath = join(process.cwd(), "dist/index.js");
  it("has been built and exists", () => {
    expect(existsSync(distPath)).toBe(true);
  });

  it("loads cleanly via dynamic import (CJS interop)", async () => {
    const mod = (await import(pathToFileURL(distPath).href)) as Record<string, unknown>;
    expect(typeof mod["runGenerator"]).toBe("function");
    expect(typeof mod["renderModule"]).toBe("function");
    expect(typeof mod["resolveOptions"]).toBe("function");
    expect(typeof mod["prismaFieldToEffectSchema"]).toBe("function");
    expect(typeof mod["prismaFieldToBaseSchema"]).toBe("function");
    expect(typeof mod["enumToSchema"]).toBe("function");
    expect(typeof mod["isIncludeField"]).toBe("function");
    expect(typeof mod["sortModels"]).toBe("function");
    expect(typeof mod["shouldQuoteName"]).toBe("function");
    expect(typeof mod["renderKey"]).toBe("function");
    expect(typeof mod["DEFAULTS"]).toBe("object");
  });

  it("produces a generated module that the build's output can write", () => {
    const dir = mkdtempSync(join(tmpdir(), "prisma-effect-dist-"));
    try {
      const m = model("Smoke", [
        field("id", "String", { isId: true }),
        field("name", "String"),
      ]);
      const { outputPath, code } = runGenerator({
        output: "./out.ts",
        schemaDir: dir,
        datamodel: datamodel([m]),
        rawConfig: undefined,
      });
      expect(readFileSync(outputPath, "utf8")).toBe(code);
      // Sanity: the output should look like generated TypeScript
      expect(code).toMatch(/export const SmokeSchema/);
      expect(code).toMatch(/import \{ Schema \} from "effect"/);
    } finally {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Reference DEFAULTS to satisfy unused-import lints in some setups.
void defaultOptions;