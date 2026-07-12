import type { ResolvedOptions } from "./types.js";

/**
 * The defaults applied when the user doesn't supply a config key.
 *
 * Kept here (not in `types.ts`) so they live next to the code that
 * consumes them and the surface area is easy to skim.
 */
export const DEFAULTS = {
  effectImport: "effect",
  effectImportName: "Schema",
  bigIntAs: "BigIntFromSelf",
  decimalAs: "String",
  dateAs: "DateFromSelf",
  exportModelNames: true,
  exportModelNameType: true,
  standardSchemaV1: false,
  relationColumns: false,
} as const satisfies ResolvedOptions;

type RawConfig = Record<string, string | string[] | boolean | undefined>;

/**
 * Normalise a string-or-boolean into a real boolean.
 *
 * Prisma passes all generator options as strings, so users write
 * `exportModelNames = "false"` to turn the feature off. We accept a real
 * `boolean` too for direct programmatic use (tests, programmatic APIs).
 */
function toBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

/**
 * Resolve user-supplied options against {@link DEFAULTS}.
 *
 * Unknown keys are dropped silently — Prisma forwards arbitrary strings
 * and we don't want to fail on a typo we don't even use.
 */
export function resolveOptions(raw: RawConfig | undefined | null): ResolvedOptions {
  const cfg = raw ?? {};
  return {
    effectImport: stringOr(cfg.effectImport, DEFAULTS.effectImport),
    effectImportName: stringOr(cfg.effectImportName, DEFAULTS.effectImportName),
    bigIntAs: enumOr(cfg.bigIntAs, DEFAULTS.bigIntAs, ["BigInt", "BigIntFromSelf"]),
    decimalAs: enumOr(cfg.decimalAs, DEFAULTS.decimalAs, ["String", "Number"]),
    dateAs: enumOr(cfg.dateAs, DEFAULTS.dateAs, ["Date", "DateFromSelf"]),
    exportModelNames: toBool(cfg.exportModelNames, DEFAULTS.exportModelNames),
    exportModelNameType: toBool(cfg.exportModelNameType, DEFAULTS.exportModelNameType),
    standardSchemaV1: toBool(cfg.standardSchemaV1, DEFAULTS.standardSchemaV1),
    relationColumns: toBool(cfg.relationColumns, DEFAULTS.relationColumns),
  };
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function enumOr<T extends string>(
  v: unknown,
  fallback: T,
  allowed: readonly T[],
): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) {
    return v as T;
  }
  return fallback;
}