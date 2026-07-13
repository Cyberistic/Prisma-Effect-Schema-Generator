import { describe, expect, it } from "vitest";
import { renderModule } from "../../src/render.js";
import { datamodel, enumValues, field, model, options } from "../_fixtures.js";

const v4 = (raw: Record<string, unknown> = {}) => options({ effectVersion: "v4", ...raw });

describe("render v4", () => {
  it("emits Schema.toStandardSchemaV1 when standardSchemaV1 is enabled", () => {
    const m = model("Todo", [field("id", "String", { isId: true })]);
    const out = renderModule(datamodel([m]), v4({ standardSchemaV1: true }));
    expect(out).toContain("export const TodoSchema = Schema.toStandardSchemaV1(Schema.Struct({");
    expect(out).toContain("}))");
  });

  it("emits Schema.Date for DateTime fields", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("publishedAt", "DateTime", { isRequired: false }),
    ]);
    const out = renderModule(datamodel([m]), v4());
    expect(out).toContain("publishedAt: Schema.NullOr(Schema.Date),");
  });

  it("emits Schema.Literals for enums", () => {
    const m = model("User", [
      field("id", "String", { isId: true }),
      field("role", "Role", { kind: "enum" }),
    ]);
    const d = datamodel([m], [{ name: "Role", values: enumValues("ADMIN", "USER") }]);
    const out = renderModule(d, v4());
    expect(out).toContain('role: Schema.Literals([Schema.Literal("ADMIN"), Schema.Literal("USER")]),');
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
