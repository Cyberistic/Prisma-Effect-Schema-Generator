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
  /** How `BigInt` Prisma fields map to Effect. Default `"BigIntFromSelf"`. */
  readonly bigIntAs?: "BigInt" | "BigIntFromSelf";
  /** How `Decimal` Prisma fields map to Effect. Default `"String"`. */
  readonly decimalAs?: "String" | "Number";
  /** How `DateTime` Prisma fields map to Effect. Default `"Date"`. */
  readonly dateAs?: "Date" | "DateFromSelf";
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
}

/**
 * Fully-resolved options (defaults applied) used internally by the renderer.
 */
export interface ResolvedOptions {
  readonly effectImport: string;
  readonly effectImportName: string;
  readonly bigIntAs: "BigInt" | "BigIntFromSelf";
  readonly decimalAs: "String" | "Number";
  readonly dateAs: "Date" | "DateFromSelf";
  readonly exportModelNames: boolean;
  readonly exportModelNameType: boolean;
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