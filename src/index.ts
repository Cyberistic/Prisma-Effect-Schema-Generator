#!/usr/bin/env node
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

// Auto-register only when this file is the entry point (i.e. Prisma
// spawned it as the generator binary). When the package is imported as
// a library we must not start the generator RPC, because that would try
// to read stdin and write stdout and interfere with the host process.
//
// `require.main === module` is the standard CommonJS signal for "run
// directly". Our compiled output is CommonJS, so this works for the
// `bin` entry point; it also safely does nothing under ESM/Bundler loads
// because `require` is not defined there.
if (
  typeof process !== "undefined" &&
  process.env.PRISMA_GENERATOR_AUTO_REGISTER !== "0" &&
  typeof require !== "undefined" &&
  require.main === module
) {
  register();
}