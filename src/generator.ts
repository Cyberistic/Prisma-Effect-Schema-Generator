import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { generatorHandler } from "@prisma/generator-helper";
import { resolveOptions } from "./config.js";
import { renderModule } from "./render.js";
import type { DMMFDatamodelLike } from "./types.js";

const PKG_NAME = "prisma-effect-schema-generator";
const PKG_VERSION = "0.1.0";

/**
 * Resolve the output file path the user asked for, against the schema
 * directory Prisma tells us about.
 *
 * - `output` may be an absolute path or relative.
 * - When relative, it's pinned to the schema file's directory so the
 *   generator behaves the same way no matter where Prisma invokes us
 *   from.
 * - When the user didn't set `output`, we use `defaultOutput` from the
 *   manifest (relative to the schema directory).
 */
export function resolveOutputPath(
  outputRaw: string | undefined,
  schemaDir: string,
  fallback: string,
): string {
  const out = outputRaw && outputRaw.length > 0 ? outputRaw : fallback;
  return isAbsolute(out) ? out : resolve(schemaDir, out);
}

/**
 * The actual generator. Pure of side effects beyond writing the file
 * and talking to Prisma -- easy to unit-test by calling
 * {@link runGenerator} with a fake `GeneratorOptions`.
 */
export function runGenerator(opts: {
  output: string;
  schemaDir: string;
  datamodel: DMMFDatamodelLike;
  rawConfig: Record<string, string | string[] | boolean | undefined> | undefined;
}): { outputPath: string; code: string } {
  const options = resolveOptions(opts.rawConfig);
  const code = renderModule(opts.datamodel, options);
  const outputPath = resolveOutputPath(opts.output, opts.schemaDir, "./generated/effect-schemas/index.ts");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, code, "utf8");
  return { outputPath, code };
}

/**
 * Adapter that wraps {@link runGenerator} with the shape Prisma's
 * generator-helper expects.
 *
 * Exposed so tests can drive the same code path that Prisma calls.
 */
export async function onGenerate(prismaOptions: {
  generator: {
    output?: { value: string | null } | null;
    config: Record<string, string | string[] | boolean | undefined>;
  };
  dmmf: { datamodel: DMMFDatamodelLike };
  schemaPath: string;
}): Promise<void> {
  runGenerator({
    output: prismaOptions.generator.output?.value ?? "",
    schemaDir: dirname(prismaOptions.schemaPath),
    datamodel: prismaOptions.dmmf.datamodel,
    rawConfig: prismaOptions.generator.config,
  });
}

/**
 * Register the generator with Prisma. The `prisma generate` command
 * spawns the generator binary, which calls `generatorHandler(...)`,
 * which in turn fires `onManifest` and `onGenerate`.
 *
 * Calling this at the top of the CJS entry is what wires everything up.
 */
export function register(): void {
  generatorHandler({
    onManifest() {
      return {
        defaultOutput: "./generated/effect-schemas/index.ts",
        prettyName: "Effect Schema Generator",
        version: PKG_VERSION,
      };
    },
    async onGenerate(options) {
      await onGenerate(options);
    },
  });
}

// Re-export the building blocks so programmatic consumers can drive
// the generator without going through Prisma at all (handy for
// snapshot tests, embedding in build scripts, etc.).
export { resolveOptions } from "./config.js";
export { renderModule } from "./render.js";
export type {
  DMMFDatamodelLike,
  DMMFEnumLike,
  DMMFFieldLike,
  DMMFModelLike,
  GeneratorOptionsConfig,
  ResolvedOptions,
} from "./types.js";

export const _internal = { PKG_NAME, PKG_VERSION };