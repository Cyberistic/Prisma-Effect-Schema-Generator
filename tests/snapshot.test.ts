import { describe, expect, it } from "vitest";
import { renderModule } from "../src/render.js";
import {
  datamodel,
  defaultOptions,
  enumField,
  enumValues,
  field,
  model,
  options,
} from "./_fixtures.js";

/**
 * Snapshot tests -- these lock the exact output format so any
 * accidental regression in the renderer surfaces as a diff.
 *
 * If you intentionally change the format, run with `-u` to update.
 */

describe("snapshot: full module output", () => {
  it("renders a realistic multi-model module", () => {
    const user = model("User", [
      field("id", "String", { isId: true }),
      field("email", "String"),
      field("displayName", "String", { isRequired: false }),
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
      field("views", "BigInt", { isRequired: false }),
      field("isDraft", "Boolean"),
    ]);
    const d = datamodel(
      [user, post],
      [{ name: "Role", values: enumValues("ADMIN", "USER", "GUEST") }],
    );
    const out = renderModule(d, defaultOptions());
    expect(out).toMatchSnapshot();
  });

  it("renders a single tiny model", () => {
    const m = model("Todo", [
      field("id", "String", { isId: true }),
      field("text", "String"),
      field("done", "Boolean"),
      field("deletedAt", "DateTime", { isRequired: false }),
    ]);
    const out = renderModule(datamodel([m]), defaultOptions());
    expect(out).toMatchSnapshot();
  });

  it("renders with custom effectImport and aliased binding", () => {
    const m = model("X", [
      field("id", "String", { isId: true }),
      enumField("color", "Color"),
    ]);
    const d = datamodel([m], [{ name: "Color", values: enumValues("RED", "BLUE") }]);
    const out = renderModule(
      d,
      options({
        effectImport: "@livestore/utils/effect",
        effectImportName: "S",
      }),
    );
    expect(out).toMatchSnapshot();
  });

  it("renders without ModelName / ALL_MODEL_NAMES", () => {
    const m = model("X", [field("y", "String")]);
    const out = renderModule(
      datamodel([m]),
      options({
        exportModelNameType: "false" as never,
        exportModelNames: "false" as never,
      }),
    );
    expect(out).toMatchSnapshot();
  });

  it("renders an empty datamodel", () => {
    const out = renderModule(datamodel([]), defaultOptions());
    expect(out).toMatchSnapshot();
  });

  it("renders a model with reserved-word field names", () => {
    const m = model("Tricky", [
      field("default", "String"),
      field("class", "Int"),
      field("name", "String"),
    ]);
    const out = renderModule(datamodel([m]), defaultOptions());
    expect(out).toMatchSnapshot();
  });
});