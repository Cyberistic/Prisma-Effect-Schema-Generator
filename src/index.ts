/**
 * prisma-effect-schema-generator
 *
 * Standalone Prisma generator that emits Effect Schema values for every
 * model in your `schema.prisma`.
 *
 * Public API:
 *   - {@link register} -- wire up the generator with `@prisma/generator-helper`.
 *   - {@link runGenerator} -- programmatic entry (no Prisma required).
 *   - {@link renderModule} -- render the TS source for a given DMMF.
 *   - {@link resolveOptions} -- normalise user config.
 *
 * Most users will never touch this file directly. Add the generator to
 * `schema.prisma` and run `prisma generate`.
 */

import { register } from "./generator.js";

export {
  register,
  runGenerator,
  onGenerate,
  resolveOutputPath,
} from "./generator.js";
export { renderModule } from "./render.js";
export {
  prismaFieldToBaseSchema,
  prismaFieldToEffectSchema,
  enumToSchema,
  isIncludeField,
  sortModels,
} from "./mapper.js";
export { resolveOptions, DEFAULTS } from "./config.js";
export { shouldQuoteName, renderKey } from "./render.js";
export type {
  DMMFDatamodelLike,
  DMMFEnumLike,
  DMMFFieldLike,
  DMMFModelLike,
  GeneratorOptionsConfig,
  ResolvedOptions,
} from "./types.js";

// Auto-register when imported as the generator entry point.
// We guard with a feature-detection on `process` so importing the
// module from tests / Node doesn't crash on environments that lack it.
if (typeof process !== "undefined" && process.env.PRISMA_GENERATOR_AUTO_REGISTER !== "0") {
  try {
    register();
  } catch {
    // No-op: registering requires `@prisma/generator-helper`'s
    // `generatorHandler`, which only works under Prisma's spawn. When
    // imported from a test / a build script we skip registration.
  }
}