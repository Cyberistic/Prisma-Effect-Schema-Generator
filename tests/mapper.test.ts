import { describe, expect, it } from "vitest";
import {
  enumToSchema,
  enumValuesForField,
  findPrimaryKeyColumn,
  findSoftDeleteColumn,
  isIncludeField,
  prismaFieldToBaseSchema,
  prismaFieldToEffectSchema,
  prismaTypeToColumnType,
  sortModels,
} from "../src/mapper.js";
import {
  datamodel,
  defaultOptions,
  enumField,
  enumValues,
  field,
  model,
  options,
  relField,
  unsupportedField,
} from "./_fixtures.js";

describe("prismaFieldToBaseSchema", () => {
  const dat = datamodel([], [
    { name: "Role", values: enumValues("ADMIN", "USER") },
  ]);

  it.each([
    ["String", "Schema.String"],
    ["Int", "Schema.Number"],
    ["Float", "Schema.Number"],
    ["Boolean", "Schema.Boolean"],
    ["DateTime", "Schema.DateFromSelf"],
    ["Json", "Schema.Unknown"],
    ["Bytes", "Schema.Uint8Array"],
  ] as const)("maps %s to %s", (type, expected) => {
    const out = prismaFieldToBaseSchema(field("x", type), dat, defaultOptions());
    expect(out.expr).toBe(expected);
    expect(out.unsupported).toBe(false);
  });

  it("maps BigInt to Schema.BigIntFromSelf by default", () => {
    const out = prismaFieldToBaseSchema(field("x", "BigInt"), dat, defaultOptions());
    expect(out.expr).toBe("Schema.BigIntFromSelf");
  });

  it("maps BigInt to Schema.BigInt when configured", () => {
    const out = prismaFieldToBaseSchema(
      field("x", "BigInt"),
      dat,
      options({ bigIntAs: "BigInt" }),
    );
    expect(out.expr).toBe("Schema.BigInt");
  });

  it("ignores invalid bigIntAs values and falls back to default", () => {
    const out = prismaFieldToBaseSchema(
      field("x", "BigInt"),
      dat,
      options({ bigIntAs: "Wat" as never }),
    );
    expect(out.expr).toBe("Schema.BigIntFromSelf");
  });

  it("maps Decimal to Schema.String by default (precision-safe)", () => {
    const out = prismaFieldToBaseSchema(field("x", "Decimal"), dat, defaultOptions());
    expect(out.expr).toBe("Schema.String");
  });

  it("maps Decimal to Schema.Number when configured", () => {
    const out = prismaFieldToBaseSchema(
      field("x", "Decimal"),
      dat,
      options({ decimalAs: "Number" }),
    );
    expect(out.expr).toBe("Schema.Number");
  });

  it("maps DateTime to Schema.DateFromSelf by default", () => {
    const out = prismaFieldToBaseSchema(field("x", "DateTime"), dat, defaultOptions());
    expect(out.expr).toBe("Schema.DateFromSelf");
  });

  it("maps DateTime to Schema.Date (ISO-string codec) when configured", () => {
    const out = prismaFieldToBaseSchema(
      field("x", "DateTime"),
      dat,
      options({ dateAs: "Date" }),
    );
    expect(out.expr).toBe("Schema.Date");
  });

  it("maps enum fields to Schema.Union of literals", () => {
    const out = prismaFieldToBaseSchema(enumField("r", "Role"), dat, defaultOptions());
    expect(out.expr).toBe('Schema.Union(Schema.Literal("ADMIN"), Schema.Literal("USER"))');
  });

  it("collapses a single-value enum to a single Schema.Literal", () => {
    const d = datamodel([], [{ name: "Only", values: enumValues("OK") }]);
    const out = prismaFieldToBaseSchema(enumField("x", "Only"), d, defaultOptions());
    expect(out.expr).toBe('Schema.Literal("OK")');
  });

  it("emits Schema.Unknown sentinel for unknown enum names", () => {
    const out = prismaFieldToBaseSchema(
      enumField("x", "Missing"),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe('Schema.Literal("UNKNOWN")');
  });

  it("emits Schema.Unknown for unsupported fields and flags them", () => {
    const out = prismaFieldToBaseSchema(
      unsupportedField("x", "Decimal"),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.Unknown");
    expect(out.unsupported).toBe(true);
  });

  it("falls back to Schema.Unknown for unknown Prisma types", () => {
    const out = prismaFieldToBaseSchema(
      field("x", "SomeFutureType"),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.Unknown");
    expect(out.unsupported).toBe(true);
  });

  it("treats object-kind fields as enums of model names (but they should never reach here)", () => {
    // Object fields are skipped by isIncludeField, but if one does slip
    // through, mapper should fall back gracefully to Schema.Unknown.
    const out = prismaFieldToBaseSchema(
      relField("posts", "Post"),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.Unknown");
    expect(out.unsupported).toBe(true);
  });
});

describe("prismaFieldToEffectSchema (with wrappers)", () => {
  const dat = datamodel([], []);

  it("wraps required scalar", () => {
    const out = prismaFieldToEffectSchema(field("x", "String"), dat, defaultOptions());
    expect(out.expr).toBe("Schema.String");
  });

  it("wraps optional scalar in NullOr", () => {
    const out = prismaFieldToEffectSchema(
      field("x", "String", { isRequired: false }),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.NullOr(Schema.String)");
  });

  it("wraps list scalar in Array", () => {
    const out = prismaFieldToEffectSchema(
      field("x", "Int", { isList: true }),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.Array(Schema.Number)");
  });

  it("wraps optional list of non-null elements in NullOr(Array)", () => {
    // Prisma's nullable list `String[]?` means: the list itself can be null,
    // and elements are always non-null. DMMF has no per-element nullability
    // for list fields, so we model this as `NullOr(Array(X))`.
    const out = prismaFieldToEffectSchema(
      field("x", "Int", { isList: true, isRequired: false }),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.NullOr(Schema.Array(Schema.Number))");
  });

  it("wraps required list correctly (Array of non-null)", () => {
    const out = prismaFieldToEffectSchema(
      field("x", "String", { isList: true, isRequired: true }),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.Array(Schema.String)");
  });

  it("preserves unsupported flag through wrapping", () => {
    const out = prismaFieldToEffectSchema(
      unsupportedField("x", "Decimal", { isList: true, isRequired: false }),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.NullOr(Schema.Array(Schema.Unknown))");
    expect(out.unsupported).toBe(true);
  });

  it("combines Array + NullOr for an optional list of an enum", () => {
    const d = datamodel([], [{ name: "Tag", values: enumValues("A", "B") }]);
    const out = prismaFieldToEffectSchema(
      enumField("tags", "Tag", { isList: true, isRequired: false }),
      d,
      defaultOptions(),
    );
    expect(out.expr).toBe(
      'Schema.NullOr(Schema.Array(Schema.Union(Schema.Literal("A"), Schema.Literal("B"))))',
    );
  });

  it("wraps an optional required scalar (no list) correctly", () => {
    const out = prismaFieldToEffectSchema(
      field("x", "Boolean", { isRequired: false }),
      dat,
      defaultOptions(),
    );
    expect(out.expr).toBe("Schema.NullOr(Schema.Boolean)");
  });
});

describe("enumToSchema", () => {
  it("renders a multi-value enum", () => {
    const d = datamodel([], [{ name: "Color", values: enumValues("RED", "GREEN", "BLUE") }]);
    expect(enumToSchema("Color", d)).toBe(
      'Schema.Union(Schema.Literal("RED"), Schema.Literal("GREEN"), Schema.Literal("BLUE"))',
    );
  });

  it("renders a single-value enum as a single Literal", () => {
    const d = datamodel([], [{ name: "One", values: enumValues("ONLY") }]);
    expect(enumToSchema("One", d)).toBe('Schema.Literal("ONLY")');
  });

  it("renders an empty enum as UNKNOWN", () => {
    const d = datamodel([], [{ name: "Empty", values: [] }]);
    expect(enumToSchema("Empty", d)).toBe('Schema.Literal("UNKNOWN")');
  });

  it("renders an unknown enum name as UNKNOWN", () => {
    const d = datamodel([], []);
    expect(enumToSchema("DoesNotExist", d)).toBe('Schema.Literal("UNKNOWN")');
  });

  it("escapes quotes in enum value names", () => {
    const d = datamodel([], [{ name: "Quote", values: enumValues('with"quote') }]);
    expect(enumToSchema("Quote", d)).toBe('Schema.Literal("with\\"quote")');
  });
});

describe("isIncludeField", () => {
  it("includes scalar fields", () => {
    expect(isIncludeField(field("x", "String"))).toBe(true);
  });

  it("includes enum fields", () => {
    expect(isIncludeField(enumField("x", "Role"))).toBe(true);
  });

  it("includes unsupported fields", () => {
    expect(isIncludeField(unsupportedField("x", "Decimal"))).toBe(true);
  });

  it("excludes relation (object) fields", () => {
    expect(isIncludeField(relField("posts", "Post"))).toBe(false);
  });
});

describe("findPrimaryKeyColumn", () => {
  it("returns the @id field", () => {
    const m = model("X", [
      field("id", "String", { isId: true }),
      field("name", "String"),
    ]);
    expect(findPrimaryKeyColumn(m)).toBe("id");
  });

  it("falls back to a unique String field", () => {
    const m = model("X", [
      field("email", "String", { isUnique: true }),
      field("name", "String"),
    ]);
    expect(findPrimaryKeyColumn(m)).toBe("email");
  });

  it("falls back to a unique Int field", () => {
    const m = model("X", [
      field("seq", "Int", { isUnique: true }),
      field("name", "String"),
    ]);
    expect(findPrimaryKeyColumn(m)).toBe("seq");
  });

  it("returns null when no primary key is detectable", () => {
    const m = model("X", [field("name", "String")]);
    expect(findPrimaryKeyColumn(m)).toBe(null);
  });

  it("prefers @id over a unique field", () => {
    const m = model("X", [
      field("id", "String", { isId: true }),
      field("email", "String", { isUnique: true }),
    ]);
    expect(findPrimaryKeyColumn(m)).toBe("id");
  });
});

describe("findSoftDeleteColumn", () => {
  it("detects deletedAt", () => {
    const m = model("X", [
      field("id", "String", { isId: true }),
      field("deletedAt", "DateTime", { isRequired: false }),
    ]);
    expect(findSoftDeleteColumn(m)).toBe("deletedAt");
  });

  it("detects isDeleted as boolean", () => {
    const m = model("X", [
      field("id", "String", { isId: true }),
      field("isDeleted", "Boolean"),
    ]);
    expect(findSoftDeleteColumn(m)).toBe("isDeleted");
  });

  it("detects archivedAt", () => {
    const m = model("X", [field("archivedAt", "DateTime", { isRequired: false })]);
    expect(findSoftDeleteColumn(m)).toBe("archivedAt");
  });

  it("returns null when there is no soft-delete column", () => {
    const m = model("X", [field("id", "String", { isId: true }), field("name", "String")]);
    expect(findSoftDeleteColumn(m)).toBe(null);
  });

  it("ignores a matching name with the wrong type", () => {
    const m = model("X", [field("deletedAt", "String")]);
    expect(findSoftDeleteColumn(m)).toBe(null);
  });
});

describe("prismaTypeToColumnType", () => {
  it.each([
    ["String", "string"],
    ["Int", "number"],
    ["Float", "number"],
    ["BigInt", "number"],
    ["Decimal", "number"],
    ["Boolean", "boolean"],
    ["DateTime", "date"],
    ["Json", "json"],
    ["Bytes", "bytes"],
    ["SomeFutureType", "unknown"],
  ] as const)("maps %s to %s", (type, expected) => {
    expect(prismaTypeToColumnType(type)).toBe(expected);
  });
});

describe("enumValuesForField", () => {
  it("returns enum values for an enum field", () => {
    const d = datamodel([], [{ name: "Role", values: enumValues("ADMIN", "USER") }]);
    const f = enumField("role", "Role");
    expect(enumValuesForField(f, d)).toEqual(["ADMIN", "USER"]);
  });

  it("returns undefined for a scalar field", () => {
    const f = field("name", "String");
    expect(enumValuesForField(f, datamodel([]))).toBeUndefined();
  });

  it("returns undefined when the enum is missing", () => {
    const f = enumField("role", "Missing");
    expect(enumValuesForField(f, datamodel([]))).toBeUndefined();
  });
});

describe("sortModels", () => {
  it("sorts by name alphabetically", () => {
    const a = { name: "Zeta", fields: [], dbName: null };
    const b = { name: "Alpha", fields: [], dbName: null };
    const c = { name: "Mu", fields: [], dbName: null };
    expect(sortModels([a, b, c]).map((m) => m.name)).toEqual(["Alpha", "Mu", "Zeta"]);
  });

  it("does not mutate the input array", () => {
    const a = { name: "Z", fields: [], dbName: null };
    const b = { name: "A", fields: [], dbName: null };
    const input = [a, b];
    const out = sortModels(input);
    expect(input.map((m) => m.name)).toEqual(["Z", "A"]);
    expect(out.map((m) => m.name)).toEqual(["A", "Z"]);
  });

  it("returns an empty array for empty input", () => {
    expect(sortModels([])).toEqual([]);
  });
});