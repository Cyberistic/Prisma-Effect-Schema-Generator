import {
  enumValuesForField,
  findPrimaryKeyColumn,
  findSoftDeleteColumn,
  isIncludeField,
  prismaFieldToEffectSchema,
  prismaTypeToColumnType,
  sortModels,
} from "./mapper.js";
import type {
  DMMFDatamodelLike,
  DMMFFieldLike,
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
 * Wrap a schema expression in `Schema.standardSchemaV1(...)` when the
 * option is enabled, otherwise return it unchanged.
 */
function wrapSchema(expr: string, options: ResolvedOptions): string {
  if (!options.standardSchemaV1) return expr;
  const binding = localBinding(options);
  return `${binding}.standardSchemaV1(${expr})`;
}

/**
 * Render a single scalar/enum/unsupported field as a key/value pair
 * suitable for a `Schema.Struct` literal.
 */
function renderStructField(
  field: DMMFFieldLike,
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): string {
  const { expr } = prismaFieldToEffectSchema(field, datamodel, options);
  const key = renderKey(field.name);
  return `  ${key}: ${expr},`;
}

/**
 * Render a single model as a `Schema.Struct({ ... })` expression.
 *
 * Relation fields (kind === "object") are skipped from the model's own
 * struct. When `relationColumns` is enabled, those relations are emitted
 * separately by {@link renderRelationSchemas}.
 */
export function renderModel(
  model: DMMFModelLike,
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): string {
  const lines: string[] = [];
  const unsupportedComments: string[] = [];

  const structExpr = `${localBinding(options)}.Struct({\n${model.fields
    .filter(isIncludeField)
    .map((f) => renderStructField(f, datamodel, options))
    .join("\n")}\n})`;
  const wrapped = wrapSchema(structExpr, options);

  lines.push(`export const ${model.name}Schema = ${wrapped}`);

  for (const field of model.fields) {
    if (!isIncludeField(field) || field.kind !== "unsupported") continue;
    unsupportedComments.push(
      `//   - ${field.name}: Prisma marks this field as "unsupported" -- typed as Schema.Unknown.`,
    );
  }

  if (unsupportedComments.length > 0) {
    lines.unshift(`// WARNING: ${model.name} contains unsupported fields:`);
    for (const c of unsupportedComments) lines.unshift(c);
    lines.unshift("");
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Render relation schemas for a model.
 *
 * Only relations with explicit local foreign keys (`relationFromFields`)
 * produce a schema. Others are skipped with a comment explaining why.
 * Each schema is named `{ModelName}{RelationFieldName}RelationSchema`.
 */
export function renderRelationSchemas(
  model: DMMFModelLike,
  datamodel: DMMFDatamodelLike,
  options: ResolvedOptions,
): string[] {
  if (!options.relationColumns) return [];

  const lines: string[] = [];
  const binding = localBinding(options);

  for (const field of model.fields) {
    if (field.kind !== "object") continue;

    const fromFields = field.relationFromFields;
    if (!fromFields || fromFields.length === 0) {
      lines.push(
        `// ${model.name}.${field.name}: relation has no local foreign-key columns; skipping relation schema.`,
      );
      continue;
    }

    const relationName = `${model.name}${capitalize(field.name)}RelationSchema`;
    const fieldMap = new Map(model.fields.map((f) => [f.name, f]));

    const relationFields = fromFields
      .map((name) => {
        const scalar = fieldMap.get(name);
        if (!scalar) {
          return {
            name,
            line: `  ${renderKey(name)}: ${binding}.Unknown,`,
          };
        }
        return {
          name,
          line: renderStructField(scalar, datamodel, options),
        };
      });

    const structExpr = `${binding}.Struct({\n${relationFields.map((f) => f.line).join("\n")}\n})`;
    const wrapped = wrapSchema(structExpr, options);

    lines.push(`export const ${relationName} = ${wrapped}`, "");
  }

  return lines;
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]! .toUpperCase() + s.slice(1);
}

/**
 * Render the `PRIMARY_KEY_COLUMNS` map when `idColumn` is enabled.
 *
 * The map is sorted by model name. Models with no detectable single-column
 * primary key get `null`.
 */
function renderPrimaryKeyColumns(
  models: readonly DMMFModelLike[],
): string[] {
  const lines: string[] = [];
  const entries = sortModels(models).map((m) => {
    const pk = findPrimaryKeyColumn(m);
    return `  ${renderKey(m.name)}: ${pk === null ? "null" : JSON.stringify(pk)},`;
  });
  lines.push(
    "export const PRIMARY_KEY_COLUMNS = {",
    ...entries,
    '} as const satisfies Record<ModelName, string | null>',
    "",
  );
  return lines;
}

/**
 * Render the `SOFT_DELETE_COLUMNS` map when `softDeleteColumn` is enabled.
 *
 * Only models with an auto-detected soft-delete column appear in the map.
 */
function renderSoftDeleteColumns(
  models: readonly DMMFModelLike[],
): string[] {
  const lines: string[] = [];
  const entries = sortModels(models)
    .map((m) => {
      const col = findSoftDeleteColumn(m);
      return col === null
        ? null
        : `  ${renderKey(m.name)}: ${JSON.stringify(col)},`;
    })
    .filter((e): e is string => e !== null);

  if (entries.length === 0) {
    lines.push(
      'export const SOFT_DELETE_COLUMNS = {} as const satisfies Partial<Record<ModelName, string>>',
      "",
    );
    return lines;
  }

  lines.push(
    "export const SOFT_DELETE_COLUMNS = {",
    ...entries,
    '} as const satisfies Partial<Record<ModelName, string>>',
    "",
  );
  return lines;
}

/**
 * Render the `TableDescriptor` interface and `TABLES` map when `tables`
 * is enabled.
 */
function renderTables(
  datamodel: DMMFDatamodelLike,
): string[] {
  const lines: string[] = [];

  lines.push(
    "export interface ColumnDescriptor {",
    '  readonly name: string',
    "  readonly type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'bytes' | 'unknown'",
    '  readonly required: boolean',
    '  readonly list: boolean',
    '  readonly unique: boolean',
    '  readonly isEnum: boolean',
    '  readonly enumValues?: ReadonlyArray<string>',
    '}',
    '',
    'export interface TableDescriptor {',
    '  readonly name: string',
    '  readonly primaryKey: string | null',
    '  readonly softDelete: string | null',
    '  readonly columns: ReadonlyArray<ColumnDescriptor>',
    '  readonly includedInSync: boolean',
    '}',
    '',
  );

  const models = sortModels(datamodel.models);
  const entries = models.map((m) => renderTableEntry(m, datamodel));

  lines.push(
    'export const TABLES: { [M in ModelName]: TableDescriptor } = {',
    ...entries,
    '}',
    "",
  );
  return lines;
}

function renderTableEntry(
  model: DMMFModelLike,
  datamodel: DMMFDatamodelLike,
): string {
  const tableName = model.dbName ?? model.name;
  const primaryKey = findPrimaryKeyColumn(model);
  const softDelete = findSoftDeleteColumn(model);
  const columns = model.fields
    .filter(isIncludeField)
    .map((f) => renderColumnDescriptor(f, datamodel));

  const columnLines =
    columns.length === 0
      ? ['    columns: [],']
      : ['    columns: [', ...columns.map((c) => `      ${c},`), '    ],'];

  return [
    `  ${renderKey(model.name)}: {`,
    `    name: ${JSON.stringify(tableName)},`,
    `    primaryKey: ${primaryKey === null ? "null" : JSON.stringify(primaryKey)},`,
    `    softDelete: ${softDelete === null ? "null" : JSON.stringify(softDelete)},`,
    ...columnLines,
    '    includedInSync: true,',
    '  },',
  ].join("\n");
}

function renderColumnDescriptor(
  field: DMMFFieldLike,
  datamodel: DMMFDatamodelLike,
): string {
  const enumValues = enumValuesForField(field, datamodel);
  const isEnum = field.kind === "enum";
  const columnType = isEnum ? "string" : prismaTypeToColumnType(field.type);
  const base = {
    name: JSON.stringify(field.name),
    type: `'${columnType}'`,
    required: String(field.isRequired),
    list: String(field.isList),
    unique: String(field.isId || field.isUnique),
    isEnum: String(isEnum),
  };

  const parts = [
    `name: ${base.name}`,
    `type: ${base.type}`,
    `required: ${base.required}`,
    `list: ${base.list}`,
    `unique: ${base.unique}`,
    `isEnum: ${base.isEnum}`,
  ];

  if (enumValues && enumValues.length > 0) {
    parts.push(`enumValues: ${JSON.stringify([...enumValues])} as const`);
  }

  return `{ ${parts.join("; ")} }`;
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
    lines.push(...renderRelationSchemas(m, datamodel, options));
  }

  if (options.idColumn) {
    lines.push(...renderPrimaryKeyColumns(models));
  }
  if (options.softDeleteColumn) {
    lines.push(...renderSoftDeleteColumns(models));
  }
  if (options.tables) {
    lines.push(...renderTables(datamodel));
  }

  lines.push(...renderModelHelpers(models, options));

  return lines.join("\n");
}