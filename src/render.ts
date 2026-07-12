import {
  isIncludeField,
  prismaFieldToEffectSchema,
  sortModels,
} from "./mapper.js";
import type {
  DMMFDatamodelLike,
  DMMFModelLike,
  ResolvedOptions,
} from "./types.js";

const RESERVED_IDENTIFIERS = new Set<string>([
  // ECMAScript reserved words -- these are illegal as object property
  // keys when unquoted, period.
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield",
  // Strict-mode reserved.
  "implements", "interface", "let", "package", "private", "protected",
  "public", "static", "await",
  // NOTE: TypeScript type-level keywords (`string`, `number`, `boolean`,
  // `any`, `unknown`, `never`, `void`, `undefined`, `null`, ...) are NOT
  // reserved as object property keys. `{ string: "hi" }` parses fine in
  // TS 5+. Only the value-level reserved words above need quoting.
]);

/**
 * Decide whether a property key needs to be quoted.
 *
 * The bare minimum is "valid identifier that is not a reserved word".
 * Anything else -- names with hyphens, spaces, leading digits -- must be
 * quoted, otherwise the generated TypeScript won't parse.
 *
 * We accept Unicode letters/digits (per the ECMAScript spec for
 * IdentifierStart/IdentifierPart) so non-ASCII names like `caf\u00e9`
 * don't get quoted needlessly.
 */
export function shouldQuoteName(name: string): boolean {
  if (RESERVED_IDENTIFIERS.has(name)) return true;
  return !/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name);
}

/**
 * Render a property key, smart-quoting it only when necessary.
 *
 * Always emits a quoted string if the name isn't a valid identifier or
 * collides with a reserved word; otherwise emits the bare identifier.
 * This is the only sane default -- we don't expose a "force quote" knob
 * because quoting bare identifiers actively hurts readability and
 * prevents destructuring in user code.
 */
export function renderKey(name: string): string {
  return shouldQuoteName(name) ? JSON.stringify(name) : name;
}

/**
 * The local binding for the Effect Schema namespace.
 *
 * Default is `Schema` -- which is what `effect` exports. If the user
 * has chosen to import it under a different name we honour that
 * throughout the file.
 */
function localBinding(options: ResolvedOptions): string {
  return options.effectImportName === "Schema"
    ? "Schema"
    : options.effectImportName;
}

/**
 * Render a single model as a `Schema.Struct({ ... })` expression.
 *
 * Relation fields (kind === "object") are skipped entirely. Scalar
 * fields are emitted in the order they appear in the DMMF.
 */
export function renderModel(
  model: DMMFModelLike,
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): string {
  const lines: string[] = [];
  const binding = localBinding(options);
  const unsupportedComments: string[] = [];

  lines.push(`export const ${model.name}Schema = ${binding}.Struct({`);

  for (const field of model.fields) {
    if (!isIncludeField(field)) continue;
    const { expr, unsupported } = prismaFieldToEffectSchema(
      field,
      datamodel,
      options,
    );
    const key = renderKey(field.name);
    lines.push(`  ${key}: ${expr},`);
    if (unsupported && field.kind === "unsupported") {
      unsupportedComments.push(
        `//   - ${field.name}: Prisma marks this field as "unsupported" -- typed as Schema.Unknown.`,
      );
    }
  }

  lines.push("})");

  if (unsupportedComments.length > 0) {
    lines.unshift(`// WARNING: ${model.name} contains unsupported fields:`);
    for (const c of unsupportedComments) lines.unshift(c);
    lines.unshift("");
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Render the helper exports at the bottom of the file:
 *
 *   export type ModelName = "Todo" | "Event";
 *   export const ALL_MODEL_NAMES = ["Todo", "Event"] as const;
 *
 * These are guarded by `options.exportModelNames` /
 * `options.exportModelNameType` so users can disable either piece.
 */
function renderModelHelpers(
  models: readonly DMMFModelLike[],
  options: ResolvedOptions,
): string[] {
  const lines: string[] = [];
  if (options.exportModelNameType && models.length > 0) {
    lines.push("export type ModelName =");
    for (const m of models) {
      lines.push(`  | ${JSON.stringify(m.name)}`);
    }
    lines.push("");
  }
  if (options.exportModelNames && models.length > 0) {
    lines.push(
      `export const ALL_MODEL_NAMES = ${JSON.stringify(models.map((m) => m.name))} as const`,
      "",
    );
  }
  return lines;
}

/**
 * Render the entire generated module.
 *
 * The output is byte-stable for the same input: model order is sorted
 * alphabetically, field order is preserved, and we always emit a
 * trailing newline.
 */
export function renderModule(
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): string {
  const lines: string[] = [];

  lines.push(
    `// AUTO-GENERATED by prisma-effect-schema-generator -- do not edit.`,
    `// Regenerate via \`prisma generate\`.`,
    "",
  );

  if (datamodel.models.length === 0) {
    lines.push(
      `// No models in your schema.prisma -- nothing to generate.`,
      `export const ALL_MODEL_NAMES = [] as const`,
      `export type ModelName = never`,
      "",
    );
    return lines.join("\n");
  }

  if (options.effectImportName === "Schema") {
    lines.push(`import { Schema } from "${options.effectImport}"`, "");
  } else {
    lines.push(
      `import { Schema as ${options.effectImportName} } from "${options.effectImport}"`,
      "",
    );
  }

  const models = sortModels(datamodel.models);
  for (const m of models) {
    lines.push(renderModel(m, datamodel, options));
  }

  lines.push(...renderModelHelpers(models, options));

  return lines.join("\n");
}