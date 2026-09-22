# GraphQL directives

Reserved for schema directives. Empty in Phase 1 by design — no directive is
implemented because there is nothing yet to authorise or transform.

Planned for Phase 2:

| Directive       | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `@auth`         | Requires an authenticated session on a field or type.           |
| `@hasRole(...)` | Requires one of the named roles within the active organisation. |
| `@tenantScoped` | Asserts the resolver filters by the request's `organizationId`. |

Directives are applied in [`../schema/index.ts`](../schema/index.ts), which is
the single place the executable schema is assembled.
