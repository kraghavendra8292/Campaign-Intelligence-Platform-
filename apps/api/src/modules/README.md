# API modules

The API is a **modular monolith**: one deployable process, internally split
into feature modules that do not reach into each other's internals.

## Module anatomy

`health/` is the reference implementation of the pattern every future module
follows:

```
modules/<name>/
  <name>.routes.ts      REST transport      (thin - delegates to the service)
  <name>.resolvers.ts   GraphQL transport   (thin - delegates to the service)
  <name>.service.ts     business logic      (no HTTP, no GraphQL, no SQL)
  <name>.repository.ts  data access         (the only layer touching Prisma)
  index.ts              the module's public surface
```

Rules:

1. Transports contain no business logic. A resolver translates arguments,
   calls a service and returns.
2. Services contain no persistence detail. They call repositories.
3. Repositories are the only place Prisma is used.
4. A module imports another module through its `index.ts`, never by reaching
   into that module's internal files.
5. From Phase 2, every repository method that touches a business entity takes
   an `organizationId` and filters by it.

## Wiring a new module

1. Add its SDL to `packages/graphql/src/typeDefs/` and register it in that
   package's `typeDefs` array.
2. Create the module folder using the anatomy above.
3. Spread its resolvers into `src/graphql/resolvers/index.ts`.
4. Mount its router (if it has one) in `src/app.ts`.

## Planned modules (NOT implemented in Phase 1)

| Module        | Phase |
| ------------- | ----- |
| `users`       | 2     |
| `auth`        | 2     |
| `candidate`   | 3     |
| `content`     | 3     |
| `projects`    | 3     |
| `achievements`| 3     |
| `qr`          | 4     |
| `feedback`    | 5     |
| `issues`      | 5     |
| `analytics`   | 6-7   |
| `ai`          | 8     |
| `events`      | 3-6   |

Phase 1 deliberately implements only `health`, as the pattern reference.
