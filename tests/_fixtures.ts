import type {
  DMMFDatamodelLike,
  DMMFEnumLike,
  DMMFFieldLike,
  DMMFModelLike,
  ResolvedOptions,
} from "../src/types.js";
import { resolveOptions } from "../src/config.js";

/**
 * Small helper to construct a scalar DMMF field with sensible defaults.
 *
 * Every property other than `name` and `type` defaults to "the safe
 * option" so tests stay readable:
 *
 *   field("title", "String")           // required string
 *   field("count", "Int", { isList: true })  // Int[]
 */
export function field(
  name: string,
  type: DMMFFieldLike["type"],
  opts: Partial<DMMFFieldLike> = {},
): DMMFFieldLike {
  return {
    kind: "scalar",
    name,
    type,
    isRequired: true,
    isList: false,
    isUnique: false,
    isId: false,
    hasDefaultValue: false,
    dbName: null,
    ...opts,
  };
}

/** Convenience: enum-typed field. */
export function enumField(
  name: string,
  type: string,
  opts: Partial<DMMFFieldLike> = {},
): DMMFFieldLike {
  return field(name, type, { kind: "enum", ...opts });
}

/** Convenience: relation field (kind === "object"). */
export function relField(
  name: string,
  type: string,
  opts: Partial<DMMFFieldLike> = {},
): DMMFFieldLike {
  return field(name, type, { kind: "object", isList: false, ...opts });
}

/** Convenience: unsupported field (e.g. Mongo `Unsupported`). */
export function unsupportedField(
  name: string,
  type: string,
  opts: Partial<DMMFFieldLike> = {},
): DMMFFieldLike {
  return field(name, type, { kind: "unsupported", ...opts });
}

/**
 * Convenience: construct a model with a fields builder.
 *
 *   model("User", [field("id", "String", { isId: true })])
 */
export function model(
  name: string,
  fields: readonly DMMFFieldLike[],
  opts: Partial<DMMFModelLike> = {},
): DMMFModelLike {
  return {
    name,
    dbName: null,
    fields,
    ...opts,
  };
}

/** Convenience: build an enum value list. */
export function enumValues(...names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

/** Convenience: build a datamodel. */
export function datamodel(
  models: readonly DMMFModelLike[],
  enums: readonly DMMFEnumLike[] = [],
): DMMFDatamodelLike {
  return { models, enums };
}

/** Resolve options with raw config. */
export function options(raw?: Record<string, unknown>): ResolvedOptions {
  return resolveOptions(raw as Record<string, string | string[] | boolean | undefined>);
}

/** Default options with everything at the documented defaults. */
export function defaultOptions(): ResolvedOptions {
  return options();
}