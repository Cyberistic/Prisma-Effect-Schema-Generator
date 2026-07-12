import { describe, expect, it } from "vitest";
import { DEFAULTS, resolveOptions } from "../src/config.js";

describe("resolveOptions", () => {
  it("returns defaults when called with no config", () => {
    const opts = resolveOptions(undefined);
    expect(opts).toEqual(DEFAULTS);
  });

  it("returns defaults when called with an empty object", () => {
    const opts = resolveOptions({});
    expect(opts).toEqual(DEFAULTS);
  });

  it("returns defaults when called with null", () => {
    const opts = resolveOptions(null);
    expect(opts).toEqual(DEFAULTS);
  });

  it("accepts custom effectImport", () => {
    expect(resolveOptions({ effectImport: "my-effect" }).effectImport).toBe("my-effect");
  });

  it("accepts custom effectImportName", () => {
    expect(resolveOptions({ effectImportName: "S" }).effectImportName).toBe("S");
  });

  it("ignores empty-string values and falls back to defaults", () => {
    const opts = resolveOptions({
      effectImport: "",
      effectImportName: "",
    });
    expect(opts.effectImport).toBe(DEFAULTS.effectImport);
    expect(opts.effectImportName).toBe(DEFAULTS.effectImportName);
  });

  describe("bigIntAs", () => {
    it("defaults to BigIntFromSelf", () => {
      expect(resolveOptions({}).bigIntAs).toBe("BigIntFromSelf");
    });
    it("accepts BigInt", () => {
      expect(resolveOptions({ bigIntAs: "BigInt" }).bigIntAs).toBe("BigInt");
    });
    it("rejects invalid values and falls back", () => {
      expect(resolveOptions({ bigIntAs: "Wat" }).bigIntAs).toBe("BigIntFromSelf");
    });
  });

  describe("decimalAs", () => {
    it("defaults to String (precision-safe)", () => {
      expect(resolveOptions({}).decimalAs).toBe("String");
    });
    it("accepts Number", () => {
      expect(resolveOptions({ decimalAs: "Number" }).decimalAs).toBe("Number");
    });
    it("rejects invalid values", () => {
      expect(resolveOptions({ decimalAs: "Decimal" }).decimalAs).toBe("String");
    });
  });

  describe("dateAs", () => {
    it("defaults to DateFromSelf", () => {
      expect(resolveOptions({}).dateAs).toBe("DateFromSelf");
    });
    it("accepts Date (JSON-style)", () => {
      expect(resolveOptions({ dateAs: "Date" }).dateAs).toBe("Date");
    });
    it("rejects invalid values", () => {
      expect(resolveOptions({ dateAs: "DateTime" }).dateAs).toBe("DateFromSelf");
    });
  });

  describe("exportModelNames", () => {
    it("defaults to true", () => {
      expect(resolveOptions({}).exportModelNames).toBe(true);
    });
    it("accepts 'true' string", () => {
      expect(resolveOptions({ exportModelNames: "true" }).exportModelNames).toBe(true);
    });
    it("accepts 'false' string", () => {
      expect(resolveOptions({ exportModelNames: "false" }).exportModelNames).toBe(false);
    });
    it("accepts boolean true", () => {
      expect(resolveOptions({ exportModelNames: true }).exportModelNames).toBe(true);
    });
    it("accepts boolean false", () => {
      expect(resolveOptions({ exportModelNames: false }).exportModelNames).toBe(false);
    });
    it("rejects arbitrary strings and falls back to default", () => {
      expect(resolveOptions({ exportModelNames: "yes" }).exportModelNames).toBe(true);
    });
  });

  describe("exportModelNameType", () => {
    it("defaults to true", () => {
      expect(resolveOptions({}).exportModelNameType).toBe(true);
    });
    it("accepts 'false' string", () => {
      expect(resolveOptions({ exportModelNameType: "false" }).exportModelNameType).toBe(false);
    });
  });

  describe("standardSchemaV1", () => {
    it("defaults to false", () => {
      expect(resolveOptions({}).standardSchemaV1).toBe(false);
    });
    it("accepts 'true'", () => {
      expect(resolveOptions({ standardSchemaV1: "true" }).standardSchemaV1).toBe(true);
    });
  });

  describe("relationColumns", () => {
    it("defaults to false", () => {
      expect(resolveOptions({}).relationColumns).toBe(false);
    });
    it("accepts 'true'", () => {
      expect(resolveOptions({ relationColumns: "true" }).relationColumns).toBe(true);
    });
  });

  describe("idColumn", () => {
    it("defaults to false", () => {
      expect(resolveOptions({}).idColumn).toBe(false);
    });
    it("accepts 'true'", () => {
      expect(resolveOptions({ idColumn: "true" }).idColumn).toBe(true);
    });
  });

  describe("softDeleteColumn", () => {
    it("defaults to false", () => {
      expect(resolveOptions({}).softDeleteColumn).toBe(false);
    });
    it("accepts 'true'", () => {
      expect(resolveOptions({ softDeleteColumn: "true" }).softDeleteColumn).toBe(true);
    });
  });

  describe("tables", () => {
    it("defaults to false", () => {
      expect(resolveOptions({}).tables).toBe(false);
    });
    it("accepts 'true'", () => {
      expect(resolveOptions({ tables: "true" }).tables).toBe(true);
    });
  });

  it("ignores unknown keys silently", () => {
    const opts = resolveOptions({
      totallyMadeUpOption: "whatever",
      anotherOne: ["yes"],
    });
    expect(opts).toEqual(DEFAULTS);
  });

  it("handles arrays in rawConfig (some options may be string[] in Prisma)", () => {
    const opts = resolveOptions({ someArray: ["a", "b"] });
    expect(opts).toEqual(DEFAULTS);
  });
});

describe("DEFAULTS", () => {
  it("are documented defaults", () => {
    expect(DEFAULTS.effectImport).toBe("effect");
    expect(DEFAULTS.effectImportName).toBe("Schema");
    expect(DEFAULTS.bigIntAs).toBe("BigIntFromSelf");
    expect(DEFAULTS.decimalAs).toBe("String");
    expect(DEFAULTS.dateAs).toBe("DateFromSelf");
    expect(DEFAULTS.exportModelNames).toBe(true);
    expect(DEFAULTS.exportModelNameType).toBe(true);
    expect(DEFAULTS.standardSchemaV1).toBe(false);
    expect(DEFAULTS.relationColumns).toBe(false);
    expect(DEFAULTS.idColumn).toBe(false);
    expect(DEFAULTS.softDeleteColumn).toBe(false);
    expect(DEFAULTS.tables).toBe(false);
  });
});