import {
  Kind,
  type ASTNode,
  type DefinitionNode,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
  type ValidationContext,
  type ValidationRule,
  GraphQLError,
} from 'graphql';

/**
 * Depth and cost limits for incoming GraphQL documents.
 *
 * WHY THIS EXISTS. `/graphql` is reachable without authentication - it has to
 * be, because the public candidate site, the QR landing page and the citizen
 * issue tracker are all served through it. Every protection the platform had
 * before Phase 10 assumed a caller who at least tried to do something ordinary:
 * rate limits cap how MANY requests arrive, and pagination caps how many ROWS
 * one field returns. Neither caps how much work a SINGLE request can ask for.
 *
 * That gap is exploitable with one request and no credentials. The schema has
 * cycles - a project has evidence, evidence has a document, an issue has
 * history - so a query can nest those types into each other until the server
 * spends minutes resolving one document. Ten such requests, well inside any
 * sane rate limit, take the API down for everybody.
 *
 * Both limits run as VALIDATION RULES, which means they reject the document
 * before a single resolver executes and before the database is touched. A
 * plugin that measured cost during execution would already have paid for it.
 *
 * WHY NOT A LIBRARY. The two rules below are about eighty lines and depend on
 * nothing but `graphql`, which is already a direct dependency. The alternatives
 * are unmaintained, pull in their own transitive trees, or estimate cost from
 * schema directives this schema does not carry. Fewer moving parts in the one
 * place that must never be bypassed.
 */

/**
 * Deliberately generous. The deepest legitimate query in the platform is the
 * public work detail - work, media, image fields - at about six levels, and the
 * admin issue detail is similar. Twelve leaves ample room for a fragment or two
 * without permitting the pathological case, which needs dozens.
 *
 * A limit tuned tightly to today's deepest query would break the next feature
 * somebody adds and would be raised in a hurry by whoever was on call.
 */
export const DEFAULT_MAX_DEPTH = 12;

/**
 * Cost is a rough proxy for "how many rows might this touch", not a promise.
 *
 * Each field costs 1. A field that takes a pagination argument multiplies the
 * cost of everything beneath it by the page size requested, because that is
 * what the server will actually do. So `works(first: 50) { evidence { ... } }`
 * is charged for fifty evidence lists rather than one.
 *
 * 5000 comfortably admits the heaviest real screen - the analytics dashboard,
 * which fans out across many aggregates - while refusing a query that asks for
 * fifty works, each with fifty updates, each with fifty of something else.
 */
export const DEFAULT_MAX_COST = 5000;

/** Arguments that mean "give me this many". Matches the platform's conventions. */
const PAGE_SIZE_ARGUMENTS = new Set(['first', 'last', 'limit', 'take']);

/**
 * The multiplier used when a field IS paginated but the size is a variable.
 *
 * Applied only to fields that actually carry a pagination argument. An earlier
 * version charged this for every field with a sub-selection, on the theory that
 * omitting `first` should not be a way out of the limit. That was wrong in a way
 * the tests caught immediately: it multiplies through plain object fields too,
 * so `works(first: 12) { nodes { coverImage { id } } }` compounded to a cost of
 * eighteen thousand and the ordinary public listing was rejected. Over-charging
 * a legitimate page is a broken site; under-charging an unpaginated list is a
 * slow query the depth limit and the services' own page clamps still bound.
 */
const ASSUMED_PAGE_SIZE = 20;

/** Caps the multiplier so an absurd `first:` cannot overflow the arithmetic. */
const MAX_PAGE_MULTIPLIER = 100;

function fragmentMap(definitions: readonly DefinitionNode[]): Map<string, FragmentDefinitionNode> {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }
  return fragments;
}

/**
 * Rejects documents nested deeper than `maxDepth`.
 *
 * Fragment spreads are followed, because otherwise the limit is trivially
 * defeated: a shallow-looking operation that spreads a fragment which spreads
 * another is exactly as expensive as writing the nesting inline.
 *
 * A fragment cycle is IGNORED rather than followed. The spec forbids cycles and
 * graphql's own `NoFragmentCycles` rule reports them, but validation rules all
 * run against the same document, so this rule must not recurse forever on an
 * invalid document before that rule gets to complain.
 */
export function depthLimit(maxDepth = DEFAULT_MAX_DEPTH): ValidationRule {
  return (context: ValidationContext) => ({
    Document(document: DocumentNode) {
      const fragments = fragmentMap(document.definitions);

      const measure = (
        selectionSet: SelectionSetNode,
        depth: number,
        visiting: ReadonlySet<string>,
      ): number => {
        let deepest = depth;

        for (const selection of selectionSet.selections) {
          if (selection.kind === Kind.FIELD) {
            // Introspection meta-fields cost nothing structurally and are
            // already gated by the introspection setting in production.
            if (selection.name.value.startsWith('__')) continue;

            deepest = selection.selectionSet
              ? Math.max(deepest, measure(selection.selectionSet, depth + 1, visiting))
              : Math.max(deepest, depth + 1);
          } else if (selection.kind === Kind.INLINE_FRAGMENT) {
            // An inline fragment is not a level of its own; it selects on the
            // same parent, so depth is unchanged.
            deepest = Math.max(deepest, measure(selection.selectionSet, depth, visiting));
          } else {
            const name = selection.name.value;
            if (visiting.has(name)) continue;
            const fragment = fragments.get(name);
            if (!fragment) continue;
            deepest = Math.max(
              deepest,
              measure(fragment.selectionSet, depth, new Set(visiting).add(name)),
            );
          }
        }

        return deepest;
      };

      for (const definition of document.definitions) {
        if (definition.kind !== Kind.OPERATION_DEFINITION) continue;

        const depth = measure(definition.selectionSet, 0, new Set());
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Query is nested too deeply (${depth} levels; the limit is ${maxDepth}).`,
              {
                nodes: [definition as ASTNode],
                // A stable machine-readable code, so a legitimate client that
                // hits this can tell it apart from a schema error.
                extensions: { code: 'GRAPHQL_QUERY_TOO_DEEP', depth, maxDepth },
              },
            ),
          );
        }
      }
    },
  });
}

/**
 * Rejects documents whose estimated cost exceeds `maxCost`.
 *
 * The estimate is deliberately crude and deliberately pessimistic: it exists to
 * refuse the obviously abusive, not to bill anybody accurately. Under-charging
 * a heavy query is a performance problem; over-charging an ordinary one is a
 * broken page, so where the two conflict this errs toward letting work through
 * and relies on the depth limit to catch the shapes that matter most.
 */
export function costLimit(maxCost = DEFAULT_MAX_COST): ValidationRule {
  return (context: ValidationContext) => ({
    Document(document: DocumentNode) {
      const fragments = fragmentMap(document.definitions);

      /**
       * How many times over this field's sub-selection will be resolved.
       *
       * Page size is looked for BOTH as a direct argument and one level inside
       * an object-literal argument, because this schema does both:
       * `publicProjects(first: 12)` from Phase 3 and
       * `publicWorks(filter: { first: 12 })` from Phase 9. Checking only direct
       * arguments would have left every Phase 5 onwards list field uncharged -
       * exactly the ones that page over the largest tables.
       *
       * A field with no pagination argument anywhere multiplies by 1. See the
       * note on ASSUMED_PAGE_SIZE for why.
       */
      const pageMultiplier = (field: FieldNode): number => {
        const fromValue = (value: ValueNode): number | null => {
          if (value.kind === Kind.INT) {
            const requested = Number.parseInt(value.value, 10);
            if (!Number.isFinite(requested) || requested <= 0) return null;
            return Math.min(requested, MAX_PAGE_MULTIPLIER);
          }
          // A variable is unknown until execution, so it is charged the assumed
          // page size - otherwise `first: $n` walks straight past the limit.
          if (value.kind === Kind.VARIABLE) return ASSUMED_PAGE_SIZE;
          return null;
        };

        for (const argument of field.arguments ?? []) {
          if (PAGE_SIZE_ARGUMENTS.has(argument.name.value)) {
            const size = fromValue(argument.value);
            if (size !== null) return size;
          }

          if (argument.value.kind === Kind.OBJECT) {
            for (const objectField of argument.value.fields) {
              if (!PAGE_SIZE_ARGUMENTS.has(objectField.name.value)) continue;
              const size = fromValue(objectField.value);
              if (size !== null) return size;
            }
          }
        }

        return 1;
      };

      const measure = (selectionSet: SelectionSetNode, visiting: ReadonlySet<string>): number => {
        let cost = 0;

        for (const selection of selectionSet.selections) {
          if (selection.kind === Kind.FIELD) {
            if (selection.name.value.startsWith('__')) continue;

            cost += 1;
            if (selection.selectionSet) {
              cost += pageMultiplier(selection) * measure(selection.selectionSet, visiting);
            }
          } else if (selection.kind === Kind.INLINE_FRAGMENT) {
            cost += measure(selection.selectionSet, visiting);
          } else {
            const name = selection.name.value;
            if (visiting.has(name)) continue;
            const fragment = fragments.get(name);
            if (!fragment) continue;
            cost += measure(fragment.selectionSet, new Set(visiting).add(name));
          }
        }

        return cost;
      };

      // Summed across operations, not taken as the maximum: a document carrying
      // twenty expensive operations costs twenty times one of them to serve.
      let total = 0;
      for (const definition of document.definitions) {
        if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
        total += measure(definition.selectionSet, new Set());
      }

      if (total > maxCost) {
        context.reportError(
          new GraphQLError(
            `Query is too expensive (estimated cost ${total}; the limit is ${maxCost}). Request fewer fields or a smaller page.`,
            { extensions: { code: 'GRAPHQL_QUERY_TOO_COMPLEX', cost: total, maxCost } },
          ),
        );
      }
    },
  });
}

/** Both limits, in the order they should be applied. */
export function queryLimitRules(maxDepth: number, maxCost: number): ValidationRule[] {
  return [depthLimit(maxDepth), costLimit(maxCost)];
}
