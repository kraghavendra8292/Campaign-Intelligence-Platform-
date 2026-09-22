/**
 * Phase 2 schema: authentication, identity, RBAC, tenancy and audit.
 *
 * Nothing here exposes a database row directly. `passwordHash`,
 * `refreshTokenHash`, `tokenHash` and every other secret column is absent by
 * construction - a GraphQL type that cannot name a field cannot leak it, which
 * is a stronger guarantee than remembering to omit it at each call site.
 */
export const authTypeDefs = /* GraphQL */ `
  enum UserStatus {
    INVITED
    ACTIVE
    SUSPENDED
    DISABLED
  }

  enum OrganizationStatus {
    ACTIVE
    SUSPENDED
  }

  enum CampaignStatus {
    DRAFT
    ACTIVE
    ARCHIVED
  }

  enum RoleScope {
    PLATFORM
    ORGANIZATION
  }

  """
  Where the refresh credential is returned.
  COOKIE sets an HttpOnly cookie and is correct for browsers.
  BODY returns the token in the response for native clients, which have no
  cookie jar and use platform secure storage instead.
  """
  enum TokenDelivery {
    COOKIE
    BODY
  }

  type Role {
    id: ID!
    key: String!
    name: String!
    description: String
    scope: RoleScope!
    rank: Int!
  }

  type Permission {
    key: String!
    description: String
  }

  type Organization {
    id: ID!
    slug: String!
    name: String!
    status: OrganizationStatus!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Campaign {
    id: ID!
    organizationId: ID!
    slug: String!
    name: String!
    status: CampaignStatus!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  "A user as seen by an administrator. Never carries credential material."
  type User {
    id: ID!
    email: String!
    fullName: String!
    status: UserStatus!
    lastLoginAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Membership {
    id: ID!
    organization: Organization!
    role: Role!
    createdAt: DateTime!
  }

  "The signed-in user, plus the authority resolved for the active tenant."
  type Viewer {
    user: User!
    organization: Organization
    campaignId: ID
    roles: [String!]!
    "Effective permissions. Advisory for the UI; the API re-checks every call."
    permissions: [String!]!
    isPlatformAdmin: Boolean!
    memberships: [Membership!]!
  }

  type SessionInfo {
    id: ID!
    createdAt: DateTime!
    lastUsedAt: DateTime!
    expiresAt: DateTime!
    ipAddress: String
    userAgent: String
    "True for the session making this request."
    current: Boolean!
  }

  type AuditActor {
    id: ID!
    email: String!
    fullName: String!
  }

  type AuditLogEntry {
    id: ID!
    action: String!
    organizationId: ID
    campaignId: ID
    actor: AuditActor
    entityType: String
    entityId: String
    metadata: JSON
    ipAddress: String
    userAgent: String
    createdAt: DateTime!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type UserConnection {
    nodes: [User!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type AuditLogConnection {
    nodes: [AuditLogEntry!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  """
  A successful authentication.

  \`refreshToken\` is non-null ONLY when TokenDelivery.BODY was requested. With
  COOKIE delivery it is null and the credential lives in an HttpOnly cookie the
  browser's JavaScript cannot read.
  """
  type AuthPayload {
    accessToken: String!
    "Access token lifetime in seconds, so a client can refresh ahead of expiry."
    expiresIn: Int!
    refreshToken: String
    viewer: Viewer!
  }

  "Deliberately contentless: it must not reveal whether the account existed."
  type GenericResult {
    success: Boolean!
  }

  input LoginInput {
    email: String!
    password: String!
    tokenDelivery: TokenDelivery = COOKIE
  }

  input RefreshTokenInput {
    "Omit when using cookie delivery; the cookie is read instead."
    refreshToken: String
    tokenDelivery: TokenDelivery = COOKIE
  }

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
    confirmPassword: String!
  }

  input ConfirmPasswordResetInput {
    token: String!
    newPassword: String!
    confirmPassword: String!
  }

  input CreateUserInput {
    email: String!
    fullName: String!
    roleKey: String!
  }

  input UpdateUserInput {
    userId: ID!
    fullName: String
  }

  input CreateCampaignInput {
    name: String!
  }

  input UpdateCampaignInput {
    campaignId: ID!
    name: String
    status: CampaignStatus
  }

  extend type Query {
    "The signed-in user. Null when unauthenticated, rather than an error."
    me: Viewer

    "Active sessions for the signed-in user."
    mySessions: [SessionInfo!]!

    "Organisations the signed-in user belongs to."
    myMemberships: [Membership!]!

    "Users in the active organisation. Requires USER_READ."
    users(first: Int = 25, after: String, search: String, status: UserStatus): UserConnection!

    "One user in the active organisation. Requires USER_READ."
    user(id: ID!): User!

    "The active organisation. Requires ORGANIZATION_READ."
    organization: Organization!

    "Organisations visible to the caller."
    organizations: [Organization!]!

    "Campaigns in the active organisation. Requires CAMPAIGN_READ."
    campaigns: [Campaign!]!
    campaign(id: ID!): Campaign!

    "Roles that may be granted, filtered to what the caller may grant."
    assignableRoles: [Role!]!

    "Audit trail for the active organisation. Requires AUDIT_READ."
    auditLogs(first: Int = 50, after: String, action: String, actorUserId: ID): AuditLogConnection!
  }

  extend type Mutation {
    login(input: LoginInput!): AuthPayload!
    logout: GenericResult!
    refreshToken(input: RefreshTokenInput): AuthPayload!

    "Always succeeds, whether or not the address is registered."
    requestPasswordReset(email: String!): GenericResult!
    confirmPasswordReset(input: ConfirmPasswordResetInput!): GenericResult!
    changePassword(input: ChangePasswordInput!): GenericResult!

    "Revokes one of the caller's own sessions, or another user's with SESSION_REVOKE_ANY."
    revokeSession(sessionId: ID!): GenericResult!

    createUser(input: CreateUserInput!): User!
    updateUser(input: UpdateUserInput!): User!
    activateUser(userId: ID!): User!
    suspendUser(userId: ID!): User!
    disableUser(userId: ID!): User!

    assignRole(userId: ID!, roleKey: String!): User!
    revokeRole(userId: ID!): User!

    createOrganization(name: String!): Organization!
    updateOrganization(name: String!): Organization!

    createCampaign(input: CreateCampaignInput!): Campaign!
    updateCampaign(input: UpdateCampaignInput!): Campaign!
    archiveCampaign(campaignId: ID!): Campaign!
  }
`;
