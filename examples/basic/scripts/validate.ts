import { Schema } from "effect";
import { UserSchema, PostSchema } from "../generated/effect-schemas/index.js";

// Decode a row through the generated schema. Anything that matches the
// TypeScript type will round-trip successfully; anything that doesn't
// will throw a ParseError.
const user = Schema.decodeUnknownSync(UserSchema)({
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  age: 36,
  role: "ADMIN",
  createdAt: new Date("2024-01-01T00:00:00Z"),
});
console.log("decoded user:", user);

const post = Schema.decodeUnknownSync(PostSchema)({
  id: "p1",
  title: "Hello, Effect",
  body: null,
  authorId: "u1",
  publishedAt: null,
  metadata: { tags: ["intro", "effect"] },
});
console.log("decoded post:", post);