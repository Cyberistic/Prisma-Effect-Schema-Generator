import { describe, expect, it } from "vitest";
import { enumToSchema, prismaFieldToBaseSchema } from "../../src/mapper.js";
import { datamodel, enumValues, field, options } from "../_fixtures.js";

const v4 = (raw: Record<string, unknown> = {}) => options({ effectVersion: "v4", ...raw });

describe("mapper v4", () => {
  describe("prismaFieldToBaseSchema", () => {
    it("maps DateTime to Schema.Date in v4", () => {
      const out = prismaFieldToBaseSchema(field("x", "DateTime"), datamodel([]), v4());
      expect(out.expr).toBe("Schema.Date");
    });

    it("ignores dateAs in v4 and always emits Schema.Date", () => {
      const out = prismaFieldToBaseSchema(
        field("x", "DateTime"),
        datamodel([]),
        v4({ dateAs: "Date" }),
      );
      expect(out.expr).toBe("Schema.Date");
    });

    it("maps BigInt based on bigIntAs in v4", () => {
      expect(prismaFieldToBaseSchema(field("x", "BigInt"), datamodel([]), v4({ bigIntAs: "BigIntFromSelf" })).expr).toBe("Schema.BigInt");
      expect(prismaFieldToBaseSchema(field("x", "BigInt"), datamodel([]), v4({ bigIntAs: "BigInt" })).expr).toBe("Schema.BigIntFromString");
    });

    it("keeps other scalar mappings unchanged", () => {
      expect(prismaFieldToBaseSchema(field("x", "String"), datamodel([]), v4()).expr).toBe("Schema.String");
      expect(prismaFieldToBaseSchema(field("x", "Int"), datamodel([]), v4()).expr).toBe("Schema.Number");
      expect(prismaFieldToBaseSchema(field("x", "Boolean"), datamodel([]), v4()).expr).toBe("Schema.Boolean");
      expect(prismaFieldToBaseSchema(field("x", "Json"), datamodel([]), v4()).expr).toBe("Schema.Unknown");
      expect(prismaFieldToBaseSchema(field("x", "Bytes"), datamodel([]), v4()).expr).toBe("Schema.Uint8Array");
    });
  });

  describe("enumToSchema", () => {
    it("renders a single enum value as Schema.Literals in v4", () => {
      const d = datamodel([], [{ name: "Role", values: enumValues("ADMIN") }]);
      const out = enumToSchema("Role", d, v4());
      expect(out).toBe('Schema.Literals([Schema.Literal("ADMIN")])');
    });

    it("renders multiple enum values as Schema.Literals in v4", () => {
      const d = datamodel([], [{ name: "Role", values: enumValues("ADMIN", "USER") }]);
      const out = enumToSchema("Role", d, v4());
      expect(out).toBe('Schema.Literals([Schema.Literal("ADMIN"), Schema.Literal("USER")])');
    });

    it("uses the custom local binding", () => {
      const d = datamodel([], [{ name: "Role", values: enumValues("A", "B") }]);
      const out = enumToSchema("Role", d, v4({ effectImportName: "S" }));
      expect(out).toBe('S.Literals([S.Literal("A"), S.Literal("B")])');
    });
  });
});
