# prisma-effect-schema-generator

A standalone [Prisma](https://www.prisma.io) generator that emits
[Effect Schema](https://effect.website/docs/schema) values for every
model in your `schema.prisma`. Drop-in runtime validation for your
database rows — perfect for sync engines, RPC layers, or anywhere you
need to assert that what you read from the DB actually matches what
your code expects.

```prisma
generator effect_client {
  provider = "prisma-effect-schema-generator"
}

model User {
  id    String  @id
  email String
  role  Role
}

enum Role {
  ADMIN
  USER
}
```

```ts
// generated/effect-schemas/index.ts (auto-generated)
import { Schema } from "effect"

export const UserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: Schema.Union(Schema.Literal("ADMIN"), Schema.Literal("USER")),
})

export type ModelName = | "User"
export const ALL_MODEL_NAMES = ["User"] as const
```

```ts
// your code
import { Schema } from "effect"
import { UserSchema } from "./generated/effect-schemas"

const user = Schema.decodeUnknownSync(UserSchema)(rowFromDatabase)
// user is fully typed as { id: string; email: string; role: "ADMIN" | "USER" }
```

## Install

```bash
npm install --save-dev prisma-effect-schema-generator
npm install effect         # the generator emits `Schema.X` from `effect`
```

## Configure

Add the generator to your `schema.prisma`:

```prisma
generator effect_client {
  provider = "prisma-effect-schema-generator"
  output   = "./generated/effect-schemas/index.ts"  // optional
}
```

Run `npx prisma generate` and the file at `output` is created (or
updated) on every regeneration.

### All options

| Option                | Default              | Description                                                                                                       |
|-----------------------|----------------------|-------------------------------------------------------------------------------------------------------------------|
| `output`              | `./generated/effect-schemas/index.ts` | Where to write the generated module. Relative to the schema file's directory. |
| `effectImport`        | `"effect"`           | Module specifier to import `Schema` from. Use `"@livestore/utils/effect"` if you live inside that ecosystem.       |
| `effectImportName`    | `"Schema"`           | Local binding name. Set to e.g. `"S"` to import as `Schema as S`.                                                 |
| `bigIntAs`            | `"BigIntFromSelf"`   | `"BigInt"` (string-encoded) or `"BigIntFromSelf"` (accepts native bigint).                                        |
| `decimalAs`           | `"String"`           | `"String"` (precision-safe) or `"Number"` (lossy but ergonomic).                                                  |
| `dateAs`              | `"DateFromSelf"`     | `"Date"` (ISO-string codec) or `"DateFromSelf"` (accepts native `Date`).                                          |
| `exportModelNames`    | `"true"`             | Emit `export const ALL_MODEL_NAMES = [...] as const`.                                                             |
| `exportModelNameType` | `"true"`             | Emit `export type ModelName = "X" | "Y"`.                                                                          |

```prisma
generator effect_client {
  provider            = "prisma-effect-schema-generator"
  output              = "./generated/effect-schemas/index.ts"
  effectImport        = "effect"
  effectImportName    = "Schema"
  bigIntAs            = "BigIntFromSelf"
  decimalAs           = "String"
  dateAs              = "DateFromSelf"
  exportModelNames    = "true"
  exportModelNameType = "true"
}
```

## Type mapping

| Prisma field       | Effect Schema (default)        | Encoded → Decoded                  |
|--------------------|--------------------------------|------------------------------------|
| `String`           | `Schema.String`                | string → string                    |
| `Int`              | `Schema.Number`                | number → number                    |
| `Float`            | `Schema.Number`                | number → number                    |
| `BigInt`           | `Schema.BigIntFromSelf`        | bigint → bigint                    |
| `Decimal`          | `Schema.String`                | string → string (precision-safe)   |
| `Boolean`          | `Schema.Boolean`               | boolean → boolean                  |
| `DateTime`         | `Schema.DateFromSelf`          | Date → Date                        |
| `Json`             | `Schema.Unknown`               | unknown → unknown                  |
| `Bytes`            | `Schema.Uint8Array`            | number[] → Uint8Array              |
| enum `<E>`         | `Schema.Union(Schema.Literal(...)...)` | string → string (literal type) |

Wrappers:

| Prisma modifier | Wrapper                           |
|-----------------|-----------------------------------|
| `field?`        | `Schema.NullOr(...)`              |
| `field[]`       | `Schema.Array(...)`               |
| `field[]?`      | `Schema.NullOr(Schema.Array(...))` |

Relations (object-typed fields) are skipped — the model itself is the
representation, so re-emitting it as a nested schema would be redundant.
If you need to validate the related entity, just compose the related
schema yourself.

## Programmatic use

The generator can be driven without Prisma, e.g. for build scripts or
custom tooling:

```ts
import { runGenerator, resolveOptions } from "prisma-effect-schema-generator"

runGenerator({
  output: "./out.ts",
  schemaDir: process.cwd(),
  datamodel: {
    models: [
      {
        name: "User",
        dbName: null,
        fields: [
          { kind: "scalar", name: "id", type: "String", isRequired: true, isList: false },
          { kind: "scalar", name: "email", type: "String", isRequired: true, isList: false },
        ],
      },
    ],
    enums: [],
  },
  rawConfig: resolveOptions({ bigIntAs: "BigInt" }),
})
```

Lower-level building blocks (`renderModule`, `prismaFieldToEffectSchema`,
`enumToSchema`, `shouldQuoteName`, ...) are also exported.

## Requirements

- Node.js >= 18
- Prisma 7+ (the `@prisma/generator-helper@7` API)
- `effect` 3.x or 4.x (peer dependency)

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## License

MIT