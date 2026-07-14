/**
 * Public configuration for the generator.
 *
 * Each option is read from the `generator` block in `schema.prisma`,
 * e.g. `effectImport = "effect"` becomes `effectImport` here.
 *
 * Unknown options are ignored (Prisma only forwards strings).
 */
export interface GeneratorOptionsConfig {
  /** Path the generated module is written to. */
  readonly output?: string;
  /** Module specifier for `Schema`. Defaults to `"effect"`. */
  readonly effectImport?: string;
  /** Local name to import `Schema` under. Defaults to `"Schema"`. */
  readonly effectImportName?: string;
  /** Effect major version to target. Defaults to `"v3"`. */
  readonly effectVersion?: "v3" | "v4";
  /** How `BigInt` Prisma fields map to Effect. Default `"BigIntFromSelf"`. */
  readonly bigIntAs?: "BigInt" | "BigIntFromSelf";
  /** How `Decimal` Prisma fields map to Effect. Default `"String"`. */
  readonly decimalAs?: "String" | "Number";
  /**
   * How `DateTime` Prisma fields map to Effect. Default `"DateFromSelf"`.
   *
   * - `"DateFromSelf"` — strict `Date` instance codec (Effect 3 + v4 same name).
   * - `"Date"` — in v4, maps to `Schema.DateFromString` (ISO string codec);
   *   in v3, maps to `Schema.Date` (string codec). Use when the wire format
   *   is an ISO-8601 string (e.g. a LiveStore TEXT column).
   * - `"DateFromMillis"` — v4-only. `Schema.DateFromMillis` decodes
   *   epoch-milliseconds numbers (e.g. a LiveStore INTEGER column) into
   *   `Date` instances. Use when the wire format is a number.
   */
  readonly dateAs?: "Date" | "DateFromSelf" | "DateFromMillis";
  /**
   * Emit `ALL_MODEL_NAMES` and `ModelName` helpers. Default `true`.
   * Set to `"false"` to disable.
   */
  readonly exportModelNames?: boolean | string;
  /**
   * Emit the `ModelName` TypeScript union type. Default `true`.
   * Set to `"false"` to disable.
   */
  readonly exportModelNameType?: boolean | string;
  /**
   * Wrap every emitted model/relation schema in `Schema.standardSchemaV1(...)`.
   * This preserves the structured row type while exposing the Standard Schema v1
   * `~standard` brand; `Context` remains `never` so consumers like LiveStore or
   * TanStack DB accept the schemas directly.
   * Default `false`.
   */
  readonly standardSchemaV1?: boolean | string;
  /**
   * Emit a separate `Schema.Struct` for each relation field that has local
   * foreign-key columns (`relationFromFields`). Default `false`.
   */
  readonly relationColumns?: boolean | string;
  /**
   * Emit `PRIMARY_KEY_COLUMNS` mapping each model to its primary-key column.
   * Default `false`.
   */
  readonly idColumn?: boolean | string;
  /**
   * Emit `SOFT_DELETE_COLUMNS` mapping each model to its soft-delete column
   * (if auto-detected). Default `false`.
   */
  readonly softDeleteColumn?: boolean | string;
  /**
   * Emit `TABLES` introspection map and `TableDescriptor` interface.
   * Default `false`.
   */
  readonly tables?: boolean | string;
}

/**
 * Fully-resolved options (defaults applied) used internally by the renderer.
 */
export interface ResolvedOptions {
  readonly effectImport: string;
  readonly effectImportName: string;
  readonly effectVersion: "v3" | "v4";
  readonly bigIntAs: "BigInt" | "BigIntFromSelf";
  readonly decimalAs: "String" | "Number";
  readonly dateAs: "Date" | "DateFromSelf" | "DateFromMillis";
  readonly exportModelNames: boolean;
  readonly exportModelNameType: boolean;
  readonly standardSchemaV1: boolean;
  readonly relationColumns: boolean;
  readonly idColumn: boolean;
  readonly softDeleteColumn: boolean;
  readonly tables: boolean;
}

/**
 * Runtime descriptor for a model's table. Emitted when `tables = "true"`.
 */
export interface TableDescriptor {
  /** SQL table name. Uses the model's `@@map` name when available. */
  readonly name: string;
  /** Primary-key column name, or `null` if none could be auto-detected. */
  readonly primaryKey: string | null;
  /** Soft-delete column name, or `null` if none was auto-detected. */
  readonly softDelete: string | null;
  /** Column descriptors for scalar and enum fields (relations are omitted). */
  readonly columns: ReadonlyArray<ColumnDescriptor>;
  /** Whether the table should participate in sync operations. */
  readonly includedInSync: boolean;
}

export interface ColumnDescriptor {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "date" | "json" | "bytes" | "unknown";
  readonly required: boolean;
  readonly list: boolean;
  readonly unique: boolean;
  readonly isEnum: boolean;
  readonly enumValues?: readonly string[];
}

/**
 * The shape of an `@prisma/dmmf` field that we care about.
 *
 * We type it minimally here so the renderer can be exercised against
 * partial fixtures in tests without needing the full DMMF type.
 */
export interface DMMFFieldLike {
  readonly kind: "scalar" | "object" | "enum" | "unsupported";
  readonly name: string;
  readonly type: string;
  readonly isRequired: boolean;
  readonly isList: boolean;
  readonly isUnique?: boolean;
  readonly isId?: boolean;
  readonly hasDefaultValue?: boolean;
  readonly dbName?: string | null;
  /**
   * For relation fields: the local scalar fields that form the foreign key.
   * E.g. `author User @relation(fields: [authorId], references: [id])`
   * gives `relationFromFields: ["authorId"]`.
   */
  readonly relationFromFields?: readonly string[];
  /**
   * For relation fields: the target fields on the related model.
   */
  readonly relationToFields?: readonly string[];
}

export interface DMMFModelLike {
  readonly name: string;
  readonly dbName?: string | null;
  readonly fields: readonly DMMFFieldLike[];
}

export interface DMMFEnumLike {
  readonly name: string;
  readonly values: readonly { readonly name: string }[];
}

export interface DMMFDatamodelLike {
  readonly models: readonly DMMFModelLike[];
  readonly enums: readonly DMMFEnumLike[];
}