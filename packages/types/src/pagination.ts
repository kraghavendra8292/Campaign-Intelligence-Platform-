/** Cursor pagination primitives for future list queries. */

export interface PageInfo {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly startCursor: string | null;
  readonly endCursor: string | null;
}

export interface Connection<TNode> {
  readonly edges: readonly Edge<TNode>[];
  readonly pageInfo: PageInfo;
  readonly totalCount: number;
}

export interface Edge<TNode> {
  readonly cursor: string;
  readonly node: TNode;
}
