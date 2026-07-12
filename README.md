# prisma-effect-schema-generator

[![npm version](https://img.shields.io/npm/v/prisma-effect-schema-generator.svg)](https://www.npmjs.com/package/prisma-effect-schema-generator)

A standalone [Prisma](https://www.prisma.io) generator that emits
[Effect Schema](https://effect.website/docs/schema) values for every
model in your `schema.prisma`. Drop-in runtime validation for your
database rows, perfect for sync engines, RPC layers, or anywhere you
need to assert that what you read from the DB actually matches what
your code expects.

A real-world example: the generator powers the schemas in
[`Cyberistic/livestore-tanstackdb`](https://github.com/Cyberistic/livestore-tanstackdb)
where a single `schema.prisma` drives both the Prisma/D1 DDL and the
LiveStore client-side validation.

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

Published on npm as [`prisma-effect-schema-generator`](https://www.npmjs.com/package/prisma-effect-schema-generator).

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
| `standardSchemaV1`    | `"false"`            | Wrap schemas in `Schema.standardSchemaV1(...)`. Narrows `Context` to `never` so libraries like TanStack DB accept the schema directly. |
| `relationColumns`     | `"false"`            | Emit a separate `Schema.Struct` for each relation that has explicit local foreign-key columns.                   |
| `idColumn`            | `"false"`            | Emit `PRIMARY_KEY_COLUMNS` map from model name to primary-key column (or `null`).                                |
| `softDeleteColumn`    | `"false"`            | Emit `SOFT_DELETE_COLUMNS` map from model name to detected soft-delete column.                                   |
| `tables`              | `"false"`            | Emit `TableDescriptor` / `ColumnDescriptor` interfaces and a `TABLES` map for runtime introspection.                 |

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
  standardSchemaV1  = "false"
  relationColumns   = "false"
  idColumn          = "false"
  softDeleteColumn  = "false"
  tables            = "false"
}
```

### Introspection helpers (`idColumn`, `softDeleteColumn`, `tables`)

Enable these options when you need runtime metadata about your Prisma schema
in addition to the per-model schemas.

```prisma
 generator effect_client {
   provider         = "prisma-effect-schema-generator"
   idColumn         = "true"
   softDeleteColumn = "true"
   tables           = "true"
 }

 model User {
   id        String   @id
   email     String
   deletedAt DateTime?
 }
```

```ts
// generated/effect-schemas/index.ts
export const PRIMARY_KEY_COLUMNS = {
  User: "id",
} as const satisfies Record<ModelName, string | null>

export const SOFT_DELETE_COLUMNS = {
  User: "deletedAt",
} as const satisfies Partial<Record<ModelName, string>>

export interface ColumnDescriptor {
  readonly name: string
  readonly type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'bytes' | 'unknown'
  readonly required: boolean
  readonly list: boolean
  readonly unique: boolean
  readonly isEnum: boolean
  readonly enumValues?: ReadonlyArray<string>
}

export interface TableDescriptor {
  readonly name: string
  readonly primaryKey: string | null
  readonly softDelete: string | null
  readonly columns: ReadonlyArray<ColumnDescriptor>
  readonly includedInSync: boolean
}

export const TABLES: { [M in ModelName]: TableDescriptor } = {
  User: {
    name: "User",
    primaryKey: "id",
    softDelete: "deletedAt",
    columns: [
      { name: "id", type: 'string', required: true, list: false, unique: true, isEnum: false },
      { name: "email", type: 'string', required: true, list: false, unique: false, isEnum: false },
      { name: "deletedAt", type: 'date', required: false, list: false, unique: false, isEnum: false },
    ],
    includedInSync: true,
  },
}
```

Primary keys are detected from `@id` first, then a single `String` or `Int`
`@unique` column. Soft-delete columns are detected by name (`deletedAt`,
`archivedAt`, `isDeleted`, `removedAt`) and type (`DateTime` or `Boolean`).

`TableDescriptor.includedInSync` is currently `true` for every generated
table. It is intended for downstream tooling to override per-table when
building sync scopes.

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

Relations (object-typed fields) are skipped from the model's own struct by
default. If you need schemas for relation foreign keys, enable
`relationColumns`:

```prisma
generator effect_client {
  provider        = "prisma-effect-schema-generator"
  relationColumns = "true"
}

model Post {
  id       String @id
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}
```

```ts
// generated/effect-schemas/index.ts
export const PostAuthorRelationSchema = Schema.Struct({
  authorId: Schema.String,
})
```

### Standard Schema v1

Enable `standardSchemaV1` to have every emitted model/relation schema
wrapped with `Schema.standardSchemaV1(...)`. The resulting values still
work as Effect schemas, but they also expose the
[Standard Schema](https://standardschema.dev/) `~standard` interface so
libraries like TanStack DB can consume them directly.

```prisma
generator effect_client {
  provider           = "prisma-effect-schema-generator"
  standardSchemaV1 = "true"
}
```

```ts
export const UserSchema = (Schema.standardSchemaV1(Schema.Struct({
  id: Schema.String,
  email: Schema.String,
}))) as unknown as Schema.Schema<unknown, unknown, never>

// The cast narrows the Effect Context to `never`, so the schema is
// accepted directly by APIs that require `Schema<T, _, never>`:
import { State } from "@livestore/livestore"

const users = State.SQLite.table({
  name: "users",
  schema: UserSchema, // no `as never` needed
})
```

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

## Related projects

### How is this different from `effect-prisma-generator`?

This project is focused on **generating Effect Schema values** from your
Prisma schema—standalone, serializable validators you can use anywhere
(read-path validation, sync engines, RPC payloads, form validation, etc.).

[`m9tdev/effect-prisma-generator`](https://github.com/m9tdev/effect-prisma-generator)
takes the opposite approach: it generates an **Effect-native service wrapper
around Prisma Client**, so every Prisma operation returns an `Effect` and
plugs into Effect's `Layer` / `Context` system. It is great if you want to
run Prisma through Effect's runtime.

| | `prisma-effect-schema-generator` | `effect-prisma-generator` |
|---|---|---|
| Output | `Schema.Struct` values + introspection maps | `PrismaService` Effect service |
| Needs Prisma Client at runtime | No | Yes |
| Primary use case | Validate rows / introspect schema | Execute Prisma operations in Effect |
| Relations | Optional `relationColumns` schemas | Full Prisma Client relation API |
| Errors | Standard `Schema` decode errors | Typed `PrismaError` unions |

If you need Effect-powered Prisma Client operations, use
`effect-prisma-generator`. If you need portable Effect schemas and metadata
from your schema, use this package.

## License

MIT
