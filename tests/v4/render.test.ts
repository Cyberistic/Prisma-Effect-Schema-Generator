import { describe, expect, it } from "vitest";
import { renderModule } from "../../src/render.js";
import { datamodel, enumValues, field, model, options, relFieldWithFK } from "../_fixtures.js";

const v4 = (raw: Record<string, unknown> = {}) => options({ effectVersion: "v4", ...raw });

describe("render v4", () => {
  it("emits Schema.toStandardSchemaV1 when standardSchemaV1 is enabled", () => {
    const m = model("Todo", [field("id", "String", { isId: true })]);
    const out = renderModule(datamodel([m]), v4({ standardSchemaV1: true }));
    expect(out).toContain("export const TodoSchema = Schema.toStandardSchemaV1(Schema.Struct({");
    expect(out).toContain("}))");
  });

  it("does not wrap when standardSchemaV1 is disabled", () => {
    const m = model("Todo", [field("id", "String", { isId: true })]);
    const out = renderModule(datamodel([m]), v4());
    expect(out).toContain("export const TodoSchema = Schema.Struct({");
    expect(out).not.toContain("toStandardSchemaV1");
  });

  it("emits Schema.Date for required DateTime fields", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("createdAt", "DateTime"),
    ]);
    const out = renderModule(datamodel([m]), v4());
    expect(out).toContain("createdAt: Schema.Date,");
  });

  it("emits Schema.Date for optional DateTime fields with dateAs = DateFromSelf", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("publishedAt", "DateTime", { isRequired: false }),
    ]);
    const out = renderModule(datamodel([m]), v4({ dateAs: "DateFromSelf" }));
    expect(out).toContain("publishedAt: Schema.NullOr(Schema.Date),");
  });

  it("emits Schema.DateFromString for optional DateTime fields with dateAs = Date", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("publishedAt", "DateTime", { isRequired: false }),
    ]);
    const out = renderModule(datamodel([m]), v4({ dateAs: "Date" }));
    expect(out).toContain("publishedAt: Schema.NullOr(Schema.DateFromString),");
  });

  it("emits Schema.Date for list DateTime fields", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("dates", "DateTime", { isList: true }),
    ]);
    const out = renderModule(datamodel([m]), v4());
    expect(out).toContain("dates: Schema.Array(Schema.Date),");
  });

  it("emits Schema.Literals for enums with multiple values", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("role", "Role", { kind: "enum" }),
    ]);
    const d = datamodel([m], [{ name: "Role", values: enumValues("ADMIN", "USER") }]);
    const out = renderModule(d, v4());
    expect(out).toContain('role: Schema.Literals(["ADMIN", "USER"]),');
  });

  it("emits Schema.Literals for enums with a single value", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("role", "Role", { kind: "enum" }),
    ]);
    const d = datamodel([m], [{ name: "Role", values: enumValues("ADMIN") }]);
    const out = renderModule(d, v4());
    expect(out).toContain('role: Schema.Literals(["ADMIN"]),');
  });

  it("emits relation schemas wrapped with toStandardSchemaV1", () => {
    const post = model("Post", [
      field("id", "String", { isId: true }),
      field("authorId", "String"),
      relFieldWithFK("author", "User", ["authorId"], ["id"]),
    ]);
    const out = renderModule(
      datamodel([post]),
      v4({ relationColumns: true, standardSchemaV1: true }),
    );
    expect(out).toContain("export const PostAuthorRelationSchema = Schema.toStandardSchemaV1(Schema.Struct({");
    expect(out).toContain("export const PostSchema = Schema.toStandardSchemaV1(Schema.Struct({");
  });

  it("emits introspection maps with v4 schemas", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("text", "String"),
      field("deletedAt", "DateTime", { isRequired: false }),
    ]);
    const out = renderModule(datamodel([m]), v4({ idColumn: true, softDeleteColumn: true, tables: true }));
    expect(out).toContain("PRIMARY_KEY_COLUMNS");
    expect(out).toContain("SOFT_DELETE_COLUMNS");
    expect(out).toContain("TABLES");
    expect(out).toContain("Schema.Date");
  });

  it("uses the custom local binding throughout", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("publishedAt", "DateTime", { isRequired: false }),
    ]);
    const out = renderModule(
      datamodel([m]),
      v4({ effectImportName: "S", standardSchemaV1: true }),
    );
    expect(out).toContain("import { Schema as S } from \"effect\"");
    expect(out).toContain("export const TodoSchema = S.toStandardSchemaV1(S.Struct({");
    expect(out).toContain("publishedAt: S.NullOr(S.Date),");
  });
});
