import type {
  DMMFDatamodelLike,
  DMMFFieldLike,
  DMMFModelLike,
  ResolvedOptions,
} from "./types.js";

/**
 * Return the local binding for the Effect Schema namespace.
 *
 * Default is `Schema` -- which is what `effect` exports. If the user
 * has chosen to import it under a different name we honour that
 * throughout the file.
 */
export function localBinding(options: ResolvedOptions): string {
  return options.effectImportName === "Schema"
    ? "Schema"
    : options.effectImportName;
}

/**
 * Map a single Prisma scalar field to its Effect Schema expression,
 * without list/optional wrappers.
 *
 * Returns the raw `Schema.<X>` identifier or a literal enum expression.
 * Wrapping (lists + NullOr) is applied by {@link prismaFieldToEffectSchema}.
 *
 * For unknown / unsupported kinds we fall back to `Schema.Unknown` and
 * emit a `// TODO` comment in the rendered output via
 * {@link prismaFieldToEffectSchema}.
 */
export function prismaFieldToBaseSchema(
  field: DMMFFieldLike,
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): { expr: string; unsupported: boolean } {
  const b = localBinding(options);

  // Enums first -- they don't have a fixed `type` like scalars do.
  if (field.kind === "enum") {
    return {
      expr: enumToSchema(field.type, datamodel, options),
      unsupported: false,
    };
  }

  // "Unsupported" fields (e.g. Mongo `Unsupported("...")`) carry a
  // declared `type` but the underlying DB can't represent it. We must
  // short-circuit here, otherwise the type-switch below would resolve
  // them to whatever their declared type maps to (often misleading).
  if (field.kind === "unsupported") {
    return { expr: `${b}.Unknown`, unsupported: true };
  }

  switch (field.type) {
    case "String":
      return { expr: `${b}.String`, unsupported: false };
    case "Int":
    case "Float":
      return { expr: `${b}.Number`, unsupported: false };
    case "BigInt":
      return { expr: `${b}.${options.bigIntAs}`, unsupported: false };
    case "Decimal":
      return { expr: `${b}.${options.decimalAs}`, unsupported: false };
    case "Boolean":
      return { expr: `${b}.Boolean`, unsupported: false };
    case "DateTime":
      return { expr: `${b}.${options.dateAs}`, unsupported: false };
    case "Json":
      return { expr: `${b}.Unknown`, unsupported: false };
    case "Bytes":
      return { expr: `${b}.Uint8Array`, unsupported: false };
    default:
      // Unknown / future Prisma types land here.
      return { expr: `${b}.Unknown`, unsupported: true };
  }
}

/**
 * Apply list + optional wrappers to a base schema expression and return
 * the final Effect Schema expression for the field.
 */
export function prismaFieldToEffectSchema(
  field: DMMFFieldLike,
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): { expr: string; unsupported: boolean } {
  const b = localBinding(options);
  const base = prismaFieldToBaseSchema(field, datamodel, options);
  let expr = base.expr;
  if (field.isList) expr = `${b}.Array(${expr})`;
  if (!field.isRequired) expr = `${b}.NullOr(${expr})`;
  return { expr, unsupported: base.unsupported };
}

/**
 * Render an enum field as `Schema.Union(Schema.Literal("A"), Schema.Literal("B"))`.
 *
 * If the enum can't be found in the datamodel we emit
 * `Schema.Literal("UNKNOWN")` as a sentinel so the generated file is still
 * parseable; the user will get a clear runtime error.
 */
export function enumToSchema(
  enumName: string,
  datamodel: DMMFDatamodelLike,
  options?: ResolvedOptions,
): string {
  const b = localBinding(options ?? {
    effectImport: "effect",
    effectImportName: "Schema",
    bigIntAs: "BigIntFromSelf",
    decimalAs: "String",
    dateAs: "DateFromSelf",
    exportModelNames: true,
    exportModelNameType: true,
    standardSchemaV1: false,
    relationColumns: false,
    idColumn: false,
    softDeleteColumn: false,
    tables: false,
  });
  const en = datamodel.enums.find((e) => e.name === enumName);
  if (!en || en.values.length === 0) {
    return `${b}.Literal("UNKNOWN")`;
  }
  const literals = en.values.map((v) => `${b}.Literal(${JSON.stringify(v.name)})`);
  if (literals.length === 1) return literals[0]!;
  return `${b}.Union(${literals.join(", ")})`;
}

/**
 * Decide whether a field is "safe" to include in the generated Struct.
 *
 * - Scalars: yes
 * - Enums:   yes
 * - Object (relation) fields: skipped (Prisma gives you the model directly)
 * - Unsupported fields: included as `Schema.Unknown` so nothing breaks
 */
export function isIncludeField(field: DMMFFieldLike): boolean {
  return field.kind === "scalar" || field.kind === "enum" || field.kind === "unsupported";
}

/**
 * Sort models so that the output is deterministic regardless of the order
 * DMMF hands them to us in. Field order inside a model is preserved.
 */
export function sortModels(models: readonly DMMFModelLike[]): DMMFModelLike[] {
  return [...models].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Introspection helpers used by idColumn / softDeleteColumn / tables options.
// ---------------------------------------------------------------------------

/**
 * Detect the primary-key column for a model.
 *
 * Preference order:
 *   1. A field with `isId: true`.
 *   2. A single field with `isUnique: true` and type `String` or `Int`.
 *   3. `null` (composite keys are not supported in v1).
 */
export function findPrimaryKeyColumn(model: DMMFModelLike): string | null {
  const idField = model.fields.find((f) => f.isId);
  if (idField) return idField.name;

  const uniqueScalarFields = model.fields.filter(
    (f) =>
      f.isUnique &&
      !f.isList &&
      (f.kind === "scalar" || f.kind === "enum") &&
      (f.type === "String" || f.type === "Int"),
  );
  if (uniqueScalarFields.length === 1) return uniqueScalarFields[0]!.name;

  return null;
}

const SOFT_DELETE_NAMES = new Set([
  "deletedAt",
  "archivedAt",
  "isDeleted",
  "removedAt",
]);

/**
 * Detect the soft-delete column for a model.
 *
 * Matches fields named `deletedAt`, `archivedAt`, `isDeleted`, or
 * `removedAt` with scalar type `DateTime` or `Boolean`.
 */
export function findSoftDeleteColumn(model: DMMFModelLike): string | null {
  const field = model.fields.find((f) => {
    if (!SOFT_DELETE_NAMES.has(f.name)) return false;
    return (
      (f.kind === "scalar" || f.kind === "enum") &&
      (f.type === "DateTime" || f.type === "Boolean")
    );
  });
  return field ? field.name : null;
}

/**
 * Map a Prisma scalar/enum type to a runtime column-type string.
 *
 * Enums are reported as `"string"` with `isEnum: true`.
 */
export function prismaTypeToColumnType(type: string): "string" | "number" | "boolean" | "date" | "json" | "bytes" | "unknown" {
  switch (type) {
    case "String":
      return "string";
    case "Int":
    case "Float":
    case "BigInt":
    case "Decimal":
      return "number";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "date";
    case "Json":
      return "json";
    case "Bytes":
      return "bytes";
    default:
      return "unknown";
  }
}

/**
 * Resolve the enum values for a field, if it is an enum field.
 */
export function enumValuesForField(
  field: DMMFFieldLike,
  datamodel: DMMFDatamodelLike,
): readonly string[] | undefined {
  if (field.kind !== "enum") return undefined;
  const en = datamodel.enums.find((e) => e.name === field.type);
  return en?.values.map((v) => v.name);
}