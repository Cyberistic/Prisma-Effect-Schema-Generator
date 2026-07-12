import { describe, expect, it } from "vitest";
import { renderKey, renderModel, renderModule, shouldQuoteName } from "../src/render.js";
import {
  datamodel,
  defaultOptions,
  enumField,
  enumValues,
  field,
  model,
  options,
  relField,
  relFieldWithFK,
  unsupportedField,
} from "./_fixtures.js";

const JS_RESERVED = [
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield", "implements",
  "interface", "let", "package", "private", "protected", "public", "static",
  "await",
];

const VALID_IDENTIFIERS = [
  "foo", "foo_bar", "_underscore", "$dollar", "camelCase", "PascalCase",
  "abc123", "data", "value", "label", "ok",
];

// Type-level keywords that LOOK reserved but are NOT banned as object
// property keys in TypeScript 5+. (Note: `null`, `true`, and `false` are
// still JS reserved words and ARE quoted.)
const TYPE_LEVEL_KEYWORDS = [
  "string", "number", "boolean", "any", "unknown", "never", "undefined",
  "object", "symbol", "bigint",
];

const INVALID_IDENTIFIERS = [
  ["123abc", "starts with digit"],
  ["foo-bar", "contains hyphen"],
  ["foo bar", "contains space"],
  ["foo.bar", "contains dot"],
  ["", "empty string"],
];

describe("shouldQuoteName", () => {
  it.each(VALID_IDENTIFIERS)("does not quote valid identifier %s", (name) => {
    expect(shouldQuoteName(name)).toBe(false);
  });

  it.each(JS_RESERVED)("quotes JS reserved word %s", (name) => {
    expect(shouldQuoteName(name)).toBe(true);
  });

  it.each(TYPE_LEVEL_KEYWORDS)("does NOT quote TS type-level keyword %s", (name) => {
    expect(shouldQuoteName(name)).toBe(false);
  });

  it.each(INVALID_IDENTIFIERS)("quotes invalid identifier (%s)", (name) => {
    expect(shouldQuoteName(name)).toBe(true);
  });
});

describe("renderKey", () => {
  it("emits bare identifier when safe", () => {
    expect(renderKey("foo")).toBe("foo");
  });

  it("quotes when name is reserved", () => {
    expect(renderKey("default")).toBe('"default"');
  });

  it("quotes when name is unsafe", () => {
    expect(renderKey("foo-bar")).toBe('"foo-bar"');
  });

  it("does NOT quote valid identifiers that look type-keyword-ish", () => {
    expect(renderKey("string")).toBe("string");
    expect(renderKey("number")).toBe("number");
    expect(renderKey("boolean")).toBe("boolean");
    expect(renderKey("any")).toBe("any");
    expect(renderKey("unknown")).toBe("unknown");
  });

  it("escapes characters in quoted output", () => {
    expect(renderKey('with"quote')).toBe('"with\\"quote"');
  });

  it("escapes backslashes", () => {
    expect(renderKey("a\\b")).toBe('"a\\\\b"');
  });

  it("escapes newlines", () => {
    expect(renderKey("a\nb")).toBe('"a\\nb"');
  });
});

describe("renderModel", () => {
  it("renders a basic scalar-only model", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("name", "String"),
      field("age", "Int", { isRequired: false }),
    ]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toMatchInlineSnapshot(`
      "export const UserSchema = Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        age: Schema.NullOr(Schema.Number),
      })
      "
    `);
  });

  it("skips relation fields", () => {
    const m = model("Post", [
      field("id", "String", { isId: true }),
      relField("author", "User"),
    ]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).not.toContain("author");
    expect(out).toContain("id: Schema.String");
  });

  it("renders enum fields", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      enumField("role", "Role"),
    ]);
    const d = datamodel([m], [{ name: "Role", values: enumValues("ADMIN", "USER") }]);
    const out = renderModel(m, d, defaultOptions());
    expect(out).toContain(
      'role: Schema.Union(Schema.Literal("ADMIN"), Schema.Literal("USER"))',
    );
  });

  it("warns for unsupported fields", () => {
    const m = model("Weird", [
      field("id", "String", { isId: true }),
      unsupportedField("data", "Decimal"),
    ]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toContain("// WARNING: Weird contains unsupported fields:");
    expect(out).toContain("//   - data:");
  });

  it("always quotes reserved words regardless of options", () => {
    const m = model("X", [field("class", "String")]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toContain('"class": Schema.String');
  });

  it("quotes field names that aren't valid identifiers", () => {
    const m = model("X", [field("first-name", "String")]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toContain('"first-name": Schema.String');
  });

  it("uses custom local binding name when configured", () => {
    const m = model("X", [field("y", "String")]);
    const out = renderModel(m, datamodel([m]), options({ effectImportName: "S" }));
    expect(out).toContain("S.Struct({");
    expect(out).toContain("y: S.String,");
  });

  it("emits list types correctly", () => {
    const m = model("X", [
      field("tags", "String", { isList: true }),
      field("maybeTags", "String", { isList: true, isRequired: false }),
    ]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toContain("tags: Schema.Array(Schema.String),");
    expect(out).toContain("maybeTags: Schema.NullOr(Schema.Array(Schema.String)),");
  });

  it("renders all scalar types correctly", () => {
    const m = model("All", [
      field("a", "String"),
      field("b", "Int", { isRequired: false }),
      field("c", "BigInt", { isRequired: false }),
      field("d", "Float", { isRequired: false }),
      field("e", "Decimal", { isRequired: false }),
      field("f", "Boolean"),
      field("g", "DateTime", { isRequired: false }),
      field("h", "Json", { isRequired: false }),
      field("i", "Bytes", { isRequired: false }),
    ]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toContain("a: Schema.String,");
    expect(out).toContain("b: Schema.NullOr(Schema.Number),");
    expect(out).toContain("c: Schema.NullOr(Schema.BigIntFromSelf),");
    expect(out).toContain("d: Schema.NullOr(Schema.Number),");
    expect(out).toContain("e: Schema.NullOr(Schema.String),");
    expect(out).toContain("f: Schema.Boolean,");
    expect(out).toContain("g: Schema.NullOr(Schema.DateFromSelf),");
    expect(out).toContain("h: Schema.NullOr(Schema.Unknown),");
    expect(out).toContain("i: Schema.NullOr(Schema.Uint8Array),");
  });

  it("renders an empty model gracefully", () => {
    const m = model("Empty", []);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out).toContain("export const EmptySchema = Schema.Struct({");
    expect(out).toContain("})");
  });
});

describe("renderModule", () => {
  it("emits a header and a single import line", () => {
    const m = model("X", [field("y", "String")]);
    const out = renderModule(datamodel([m]), defaultOptions());
    expect(out.startsWith("// AUTO-GENERATED by prisma-effect-schema-generator")).toBe(true);
    expect(out).toContain('import { Schema } from "effect"');
  });

  it("emits a custom import when configured", () => {
    const m = model("X", [field("y", "String")]);
    const out = renderModule(
      datamodel([m]),
      options({ effectImport: "@livestore/utils/effect" }),
    );
    expect(out).toContain('import { Schema } from "@livestore/utils/effect"');
  });

  it("emits aliased import when effectImportName differs from Schema", () => {
    const m = model("X", [field("y", "String")]);
    const out = renderModule(datamodel([m]), options({ effectImportName: "S" }));
    expect(out).toContain('import { Schema as S } from "effect"');
    expect(out).toContain("S.Struct({");
  });

  it("sorts models alphabetically regardless of DMMF order", () => {
    const zeta = model("Zeta", [field("y", "String")]);
    const alpha = model("Alpha", [field("y", "String")]);
    const mu = model("Mu", [field("y", "String")]);
    const out = renderModule(datamodel([zeta, alpha, mu]), defaultOptions());
    const iA = out.indexOf("AlphaSchema");
    const iM = out.indexOf("MuSchema");
    const iZ = out.indexOf("ZetaSchema");
    expect(iA).toBeGreaterThan(-1);
    expect(iM).toBeGreaterThan(iA);
    expect(iZ).toBeGreaterThan(iM);
  });

  it("emits ModelName and ALL_MODEL_NAMES by default", () => {
    const m = model("User", [field("y", "String")]);
    const out = renderModule(datamodel([m]), defaultOptions());
    expect(out).toContain("export type ModelName =");
    expect(out).toContain('  | "User"');
    expect(out).toContain('export const ALL_MODEL_NAMES = ["User"] as const');
  });

  it("omits ModelName type when exportModelNameType = false", () => {
    const m = model("User", [field("y", "String")]);
    const out = renderModule(
      datamodel([m]),
      options({ exportModelNameType: "false" as never }),
    );
    expect(out).not.toContain("export type ModelName");
    expect(out).toContain("export const ALL_MODEL_NAMES");
  });

  it("omits ALL_MODEL_NAMES when exportModelNames = false", () => {
    const m = model("User", [field("y", "String")]);
    const out = renderModule(
      datamodel([m]),
      options({ exportModelNames: "false" as never }),
    );
    expect(out).toContain("export type ModelName");
    expect(out).not.toContain("ALL_MODEL_NAMES");
  });

  it("omits both helpers when configured", () => {
    const m = model("User", [field("y", "String")]);
    const out = renderModule(
      datamodel([m]),
      options({
        exportModelNames: "false" as never,
        exportModelNameType: "false" as never,
      }),
    );
    expect(out).not.toContain("ModelName");
    expect(out).not.toContain("ALL_MODEL_NAMES");
  });

  it("handles empty datamodel without crashing", () => {
    const out = renderModule(datamodel([]), defaultOptions());
    expect(out).toContain("// No models in your schema.prisma");
    expect(out).toContain("export const ALL_MODEL_NAMES = [] as const");
    expect(out).toContain("export type ModelName = never");
    expect(out).not.toContain("import { Schema }"); // no import when empty
  });

  it("preserves field order inside a model", () => {
    const m = model("X", [
      field("z", "String"),
      field("a", "String"),
      field("m", "String"),
    ]);
    const out = renderModel(m, datamodel([m]), defaultOptions());
    expect(out.indexOf("z: Schema.String")).toBeLessThan(out.indexOf("a: Schema.String"));
    expect(out.indexOf("a: Schema.String")).toBeLessThan(out.indexOf("m: Schema.String"));
  });

  it("emits a trailing newline", () => {
    const m = model("X", [field("y", "String")]);
    const out = renderModule(datamodel([m]), defaultOptions());
    expect(out.endsWith("\n")).toBe(true);
  });

  it("is byte-stable: two consecutive renders produce the same output", () => {
    const m = model("X", [
      field("y", "String"),
      field("z", "Int", { isRequired: false }),
    ]);
    const d = datamodel([m], [{ name: "R", values: enumValues("A", "B") }]);
    const a = renderModule(d, defaultOptions());
    const b = renderModule(d, defaultOptions());
    expect(a).toBe(b);
  });

  it("renders a realistic full-feature example", () => {
    const user = model("User", [
      field("id", "String", { isId: true }),
      field("email", "String"),
      field("name", "String", { isRequired: false }),
      field("age", "Int", { isRequired: false }),
      field("tags", "String", { isList: true }),
      field("role", "Role", { kind: "enum" }),
    ]);
    const post = model("Post", [
      field("id", "String", { isId: true }),
      field("title", "String"),
      field("body", "String", { isRequired: false }),
      field("authorId", "String"),
      field("publishedAt", "DateTime", { isRequired: false }),
      field("metadata", "Json", { isRequired: false }),
    ]);
    const d = datamodel(
      [user, post],
      [{ name: "Role", values: enumValues("ADMIN", "USER", "GUEST") }],
    );
    const out = renderModule(d, defaultOptions());
    expect(out).toContain("export const UserSchema = Schema.Struct({");
    expect(out).toContain("export const PostSchema = Schema.Struct({");
    expect(out).toContain('role: Schema.Union(Schema.Literal("ADMIN"), Schema.Literal("USER"), Schema.Literal("GUEST"))');
    expect(out).toContain("metadata: Schema.NullOr(Schema.Unknown),");
    expect(out).toContain("publishedAt: Schema.NullOr(Schema.DateFromSelf),");
  });

  describe("standardSchemaV1", () => {
    it("wraps model schemas in Schema.standardSchemaV1 when enabled", () => {
      const m = model("Todo", [
        field("id", "String", { isId: true }),
        field("text", "String"),
      ]);
      const out = renderModule(datamodel([m]), options({ standardSchemaV1: true }));
      expect(out).toContain("export const TodoSchema = (Schema.standardSchemaV1(Schema.Struct({");
      expect(out).toContain("}))) as unknown as Schema.Schema<unknown, unknown, never>");
    });

    it("works with a custom local binding name", () => {
      const m = model("Todo", [field("id", "String", { isId: true })]);
      const out = renderModule(
        datamodel([m]),
        options({ standardSchemaV1: true, effectImportName: "S" }),
      );
      expect(out).toContain("export const TodoSchema = (S.standardSchemaV1(S.Struct({");
      expect(out).toContain("}))) as unknown as S.Schema<unknown, unknown, never>");
    });

    it("does not wrap when disabled", () => {
      const m = model("Todo", [field("id", "String", { isId: true })]);
      const out = renderModule(datamodel([m]), defaultOptions());
      expect(out).toContain("export const TodoSchema = Schema.Struct({");
      expect(out).not.toContain("standardSchemaV1");
    });
  });

  describe("relationColumns", () => {
    it("emits a relation schema for explicit foreign keys", () => {
      const post = model("Post", [
        field("id", "String", { isId: true }),
        field("title", "String"),
        field("authorId", "String"),
        relFieldWithFK("author", "User", ["authorId"], ["id"]),
      ]);
      const out = renderModule(datamodel([post]), options({ relationColumns: true }));
      expect(out).toContain("export const PostAuthorRelationSchema = Schema.Struct({");
      expect(out).toContain("authorId: Schema.String,");
    });

    it("emits a comment for relations without local foreign keys", () => {
      const user = model("User", [
        field("id", "String", { isId: true }),
        relField("posts", "Post", { isList: true }),
      ]);
      const out = renderModule(datamodel([user]), options({ relationColumns: true }));
      expect(out).toContain("// User.posts: relation has no local foreign-key columns; skipping relation schema.");
      expect(out).not.toContain("UserPostsRelationSchema");
    });

    it("handles composite foreign keys", () => {
      const membership = model("Membership", [
        field("id", "String", { isId: true }),
        field("groupId", "String"),
        field("memberId", "String"),
        relFieldWithFK("group", "Group", ["groupId"], ["id"]),
        relFieldWithFK("member", "User", ["memberId"], ["id"]),
      ]);
      const out = renderModule(
        datamodel([membership]),
        options({ relationColumns: true }),
      );
      expect(out).toContain("export const MembershipGroupRelationSchema = Schema.Struct({");
      expect(out).toContain("groupId: Schema.String,");
      expect(out).toContain("export const MembershipMemberRelationSchema = Schema.Struct({");
      expect(out).toContain("memberId: Schema.String,");
    });

    it("uses Schema.Unknown for a missing foreign-key field", () => {
      const post = model("Post", [
        field("id", "String", { isId: true }),
        relFieldWithFK("author", "User", ["missingFk"], ["id"]),
      ]);
      const out = renderModule(datamodel([post]), options({ relationColumns: true }));
      expect(out).toContain("export const PostAuthorRelationSchema = Schema.Struct({");
      expect(out).toContain("missingFk: Schema.Unknown,");
    });

    it("wraps relation schemas in standardSchemaV1 when both options are enabled", () => {
      const post = model("Post", [
        field("id", "String", { isId: true }),
        field("authorId", "String"),
        relFieldWithFK("author", "User", ["authorId"], ["id"]),
      ]);
      const out = renderModule(
        datamodel([post]),
        options({ relationColumns: true, standardSchemaV1: true }),
      );
      expect(out).toContain("export const PostAuthorRelationSchema = (Schema.standardSchemaV1(Schema.Struct({");
      expect(out).toContain("export const PostSchema = (Schema.standardSchemaV1(Schema.Struct({");
      expect(out).toContain("}))) as unknown as Schema.Schema<unknown, unknown, never>");
    });
  });

  describe("idColumn", () => {
    it("emits PRIMARY_KEY_COLUMNS", () => {
      const todo = model("Todo", [
        field("id", "String", { isId: true }),
        field("text", "String"),
      ]);
      const event = model("Event", [
        field("id", "Int", { isId: true }),
        field("name", "String"),
      ]);
      const out = renderModule(datamodel([todo, event]), options({ idColumn: true }));
      expect(out).toContain("export const PRIMARY_KEY_COLUMNS = {");
      expect(out).toContain("  Todo: \"id\",");
      expect(out).toContain("  Event: \"id\",");
      expect(out).toContain("as const satisfies Record<ModelName, string | null>");
    });

    it("uses null for models with no detectable primary key", () => {
      const m = model("X", [field("name", "String")]);
      const out = renderModule(datamodel([m]), options({ idColumn: true }));
      expect(out).toContain("  X: null,");
      expect(out).toContain("Record<ModelName, string | null>");
    });

    it("falls back to a unique String field", () => {
      const m = model("X", [
        field("email", "String", { isUnique: true }),
        field("name", "String"),
      ]);
      const out = renderModule(datamodel([m]), options({ idColumn: true }));
      expect(out).toContain("  X: \"email\",");
    });
  });

  describe("softDeleteColumn", () => {
    it("emits SOFT_DELETE_COLUMNS with detected columns", () => {
      const todo = model("Todo", [
        field("id", "String", { isId: true }),
        field("deletedAt", "DateTime", { isRequired: false }),
      ]);
      const event = model("Event", [
        field("id", "String", { isId: true }),
        field("name", "String"),
      ]);
      const out = renderModule(
        datamodel([todo, event]),
        options({ softDeleteColumn: true }),
      );
      expect(out).toContain("export const SOFT_DELETE_COLUMNS = {");
      expect(out).toContain("  Todo: \"deletedAt\",");
      expect(out).not.toContain("  Event:");
      expect(out).toContain("as const satisfies Partial<Record<ModelName, string>>");
    });

    it("emits an empty object when no soft-delete columns exist", () => {
      const m = model("X", [field("id", "String", { isId: true }), field("name", "String")]);
      const out = renderModule(datamodel([m]), options({ softDeleteColumn: true }));
      expect(out).toContain(
        'export const SOFT_DELETE_COLUMNS = {} as const satisfies Partial<Record<ModelName, string>>',
      );
    });
  });

  describe("tables", () => {
    it("emits TableDescriptor interface and TABLES map", () => {
      const todo = model("Todo", [
        field("id", "String", { isId: true }),
        field("text", "String"),
        field("completed", "Boolean"),
        field("deletedAt", "DateTime", { isRequired: false }),
      ]);
      const out = renderModule(datamodel([todo]), options({ tables: true }));
      expect(out).toContain("export interface ColumnDescriptor {");
      expect(out).toContain("export interface TableDescriptor {");
      expect(out).toContain("export const TABLES: { [M in ModelName]: TableDescriptor } = {");
      expect(out).toContain("Todo: {");
      expect(out).toContain("name: \"Todo\"");
      expect(out).toContain("primaryKey: \"id\"");
      expect(out).toContain("softDelete: \"deletedAt\"");
      expect(out).toContain("includedInSync: true");
      expect(out).toContain("columns: [");
      expect(out).toContain("{ name: \"id\", type: 'string', required: true, list: false, unique: true, isEnum: false }");
      expect(out).toContain("{ name: \"text\", type: 'string', required: true, list: false, unique: false, isEnum: false }");
      expect(out).toContain("{ name: \"completed\", type: 'boolean', required: true, list: false, unique: false, isEnum: false }");
      expect(out).toContain("{ name: \"deletedAt\", type: 'date', required: false, list: false, unique: false, isEnum: false }");
    });

    it("uses dbName for the table name", () => {
      const todo = model("Todo", [field("id", "String", { isId: true })], {
        dbName: "todos",
      });
      const out = renderModule(datamodel([todo]), options({ tables: true }));
      expect(out).toContain("name: \"todos\"");
    });

    it("includes enum values in the column descriptor", () => {
      const user = model("User", [
        field("id", "String", { isId: true }),
        enumField("role", "Role"),
      ]);
      const d = datamodel([user], [{ name: "Role", values: enumValues("ADMIN", "USER") }]);
      const out = renderModule(d, options({ tables: true }));
      expect(out).toContain(
        "{ name: \"role\", type: 'string', required: true, list: false, unique: false, isEnum: true, enumValues: [\"ADMIN\",\"USER\"] as const }",
      );
    });

    it("emits an empty columns array for models with no include fields", () => {
      const m = model("Empty", []);
      const out = renderModule(datamodel([m]), options({ tables: true }));
      expect(out).toContain("columns: []");
    });
  });

  describe("relationColumns", () => {
    it("emits a relation schema for explicit foreign keys", () => {
      const post = model("Post", [
        field("id", "String", { isId: true }),
        field("title", "String"),
        field("authorId", "String"),
        relFieldWithFK("author", "User", ["authorId"], ["id"]),
      ]);
      const out = renderModule(datamodel([post]), options({ relationColumns: true }));
      expect(out).toContain("export const PostAuthorRelationSchema = Schema.Struct({");
      expect(out).toContain("authorId: Schema.String,");
    });

    it("emits a comment for relations without local foreign keys", () => {
      const user = model("User", [
        field("id", "String", { isId: true }),
        relField("posts", "Post", { isList: true }),
      ]);
      const out = renderModule(datamodel([user]), options({ relationColumns: true }));
      expect(out).toContain("// User.posts: relation has no local foreign-key columns; skipping relation schema.");
      expect(out).not.toContain("UserPostsRelationSchema");
    });

    it("handles composite foreign keys", () => {
      const membership = model("Membership", [
        field("id", "String", { isId: true }),
        field("groupId", "String"),
        field("memberId", "String"),
        relFieldWithFK("group", "Group", ["groupId"], ["id"]),
        relFieldWithFK("member", "User", ["memberId"], ["id"]),
      ]);
      const out = renderModule(
        datamodel([membership]),
        options({ relationColumns: true }),
      );
      expect(out).toContain("export const MembershipGroupRelationSchema = Schema.Struct({");
      expect(out).toContain("groupId: Schema.String,");
      expect(out).toContain("export const MembershipMemberRelationSchema = Schema.Struct({");
      expect(out).toContain("memberId: Schema.String,");
    });

    it("uses Schema.Unknown for a missing foreign-key field", () => {
      const post = model("Post", [
        field("id", "String", { isId: true }),
        relFieldWithFK("author", "User", ["missingFk"], ["id"]),
      ]);
      const out = renderModule(datamodel([post]), options({ relationColumns: true }));
      expect(out).toContain("export const PostAuthorRelationSchema = Schema.Struct({");
      expect(out).toContain("missingFk: Schema.Unknown,");
    });

    it("wraps relation schemas in standardSchemaV1 when both options are enabled", () => {
      const post = model("Post", [
        field("id", "String", { isId: true }),
        field("authorId", "String"),
        relFieldWithFK("author", "User", ["authorId"], ["id"]),
      ]);
      const out = renderModule(
        datamodel([post]),
        options({ relationColumns: true, standardSchemaV1: true }),
      );
      expect(out).toContain("export const PostAuthorRelationSchema = (Schema.standardSchemaV1(Schema.Struct({");
      expect(out).toContain("export const PostSchema = (Schema.standardSchemaV1(Schema.Struct({");
      expect(out).toContain("}))) as unknown as Schema.Schema<unknown, unknown, never>");
    });
  });

  describe("combined options", () => {
    it("emits all maps when enabled together", () => {
      const todo = model("Todo", [
        field("id", "String", { isId: true }),
        field("text", "String"),
        field("deletedAt", "DateTime", { isRequired: false }),
      ]);
      const out = renderModule(
        datamodel([todo]),
        options({ idColumn: true, softDeleteColumn: true, tables: true }),
      );
      expect(out).toContain("PRIMARY_KEY_COLUMNS");
      expect(out).toContain("SOFT_DELETE_COLUMNS");
      expect(out).toContain("TABLES");
      expect(out).toContain("ALL_MODEL_NAMES");
      expect(out).toContain("ModelName");
    });
  });
});