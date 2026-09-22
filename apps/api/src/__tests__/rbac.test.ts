import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  highestRank,
  permissionsForRoles,
  type AuthContext,
  type Permission,
  type RoleKey,
} from '@rk/types';
import { authorizationService } from '../modules/auth/authorization.service';
import { AppError } from '../errors/AppError';

/**
 * Pure authorization logic.
 *
 * No database and no HTTP: these assert the rules themselves, so a regression
 * in the permission matrix or the escalation guard fails here immediately
 * rather than surfacing as a subtle integration failure.
 */

function contextFor(roles: RoleKey[], overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    email: 'user@example.test',
    isPlatformAdmin: roles.includes('SUPER_ADMIN'),
    organizationId: 'org-1',
    campaignId: null,
    roles,
    permissions: permissionsForRoles(roles),
    ...overrides,
  };
}

describe('permission matrix', () => {
  it('defines all eight roles', () => {
    expect(ROLE_KEYS).toHaveLength(8);
    expect(ROLE_KEYS).toEqual([
      'SUPER_ADMIN',
      'CAMPAIGN_ADMIN',
      'CANDIDATE',
      'CONTENT_MANAGER',
      'ISSUE_MANAGER',
      'FIELD_COORDINATOR',
      'ANALYST',
      'VIEWER',
    ]);
  });

  it('gives SUPER_ADMIN every permission', () => {
    expect(new Set(ROLE_PERMISSIONS.SUPER_ADMIN)).toEqual(new Set(PERMISSIONS));
  });

  it('references only declared permissions', () => {
    for (const role of ROLE_KEYS) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('withholds platform administration from every tenant role', () => {
    const platformOnly: Permission[] = ['ORGANIZATION_CREATE', 'USER_DELETE'];

    for (const role of ROLE_KEYS) {
      if (role === 'SUPER_ADMIN') continue;
      for (const permission of platformOnly) {
        expect(ROLE_PERMISSIONS[role]).not.toContain(permission);
      }
    }
  });

  it('withholds role administration from non-admin roles', () => {
    for (const role of [
      'CANDIDATE',
      'CONTENT_MANAGER',
      'ISSUE_MANAGER',
      'FIELD_COORDINATOR',
      'ANALYST',
      'VIEWER',
    ] as RoleKey[]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('ROLE_ASSIGN');
      expect(ROLE_PERMISSIONS[role]).not.toContain('ROLE_REVOKE');
      expect(ROLE_PERMISSIONS[role]).not.toContain('USER_CREATE');
      expect(ROLE_PERMISSIONS[role]).not.toContain('USER_UPDATE');
    }
  });

  it('gives every role self-service over its own account', () => {
    for (const role of ROLE_KEYS) {
      expect(ROLE_PERMISSIONS[role]).toContain('PROFILE_READ');
      expect(ROLE_PERMISSIONS[role]).toContain('SESSION_READ_OWN');
    }
  });

  it('restricts audit reading to admin roles', () => {
    expect(ROLE_PERMISSIONS.CAMPAIGN_ADMIN).toContain('AUDIT_READ');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('AUDIT_READ');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('AUDIT_READ');
  });

  it('contains no Phase 7+ business permission', () => {
    // The boundary this guard defends moves forward one phase at a time.
    // Phase 3 added content permissions, Phase 4 added QR_*, Phase 5 added
    // ISSUE_* and Phase 6 added AI_*, so what must still be absent is
    // volunteer management, task assignment and billing.
    //
    // AI_ WAS REMOVED FROM THIS LIST IN PHASE 6, when the AI issue
    // intelligence layer was actually built. That is the only reason it is
    // gone: this guard is relaxed by implementing a phase, never to make a
    // failing assertion pass.
    const notYetImplemented = /^(VOLUNTEER_|TASK_|PAYMENT_|BILLING_|SUBSCRIPTION_)/;
    for (const permission of PERMISSIONS) {
      expect(permission).not.toMatch(notYetImplemented);
    }
  });

  it('contains no political profiling permission, in any phase', () => {
    // THIS LIST NEVER SHRINKS. Unlike the guard above, nothing here is "a later
    // phase" - supporter scoring, voter profiling, affiliation inference and
    // sentiment scoring of people are permanently out of scope by product
    // policy, and this assertion is the tripwire that keeps them out.
    //
    // It matters more now than it did before Phase 6. The AI layer is exactly
    // where somebody would most plausibly add a permission like
    // AI_SUPPORTER_SCORE or AI_SENTIMENT_READ and believe it was a natural
    // extension of summarisation. It is not, and this fails the build if it
    // appears anywhere in the permission set.
    const permanentlyForbidden =
      /(SUPPORTER_|OPPONENT_|VOTER_|VOTING_|PROFILING_|PROFILE_SCORE|AFFILIATION|IDEOLOG|SENTIMENT|PERSUAS|PREDICT)/i;
    for (const permission of PERMISSIONS) {
      expect(permission).not.toMatch(permanentlyForbidden);
    }
  });

  it('includes the Phase 6 AI permissions', () => {
    for (const permission of [
      'AI_INSIGHT_READ',
      'AI_ISSUE_PROCESS',
      'AI_ISSUE_REGENERATE',
      'AI_SUMMARY_REVIEW',
      'AI_ANALYTICS_READ',
    ] as const) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it('separates reading AI output from generating and approving it', () => {
    // Reading costs nothing, generating costs money, approving is the
    // endorsement. An analyst reads; only operational roles spend and approve.
    expect(ROLE_PERMISSIONS.ANALYST).toContain('AI_INSIGHT_READ');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('AI_ISSUE_PROCESS');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('AI_SUMMARY_REVIEW');

    // The candidate sees the aggregate picture but does not endorse it: putting
    // the organisation's name behind an administrative summary is staff work.
    expect(ROLE_PERMISSIONS.CANDIDATE).toContain('AI_INSIGHT_READ');
    expect(ROLE_PERMISSIONS.CANDIDATE).not.toContain('AI_SUMMARY_REVIEW');

    // A viewer holds none of it.
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('AI_INSIGHT_READ');

    expect(ROLE_PERMISSIONS.ISSUE_MANAGER).toContain('AI_ISSUE_PROCESS');
    expect(ROLE_PERMISSIONS.ISSUE_MANAGER).toContain('AI_SUMMARY_REVIEW');
  });

  it('includes the Phase 5 issue permissions', () => {
    for (const permission of [
      'ISSUE_READ',
      'ISSUE_UPDATE',
      'ISSUE_ASSIGN',
      'ISSUE_STATUS_UPDATE',
      'ISSUE_PRIORITY_UPDATE',
      'ISSUE_MODERATE',
      'ISSUE_NOTE_READ',
      'ISSUE_NOTE_CREATE',
      'ISSUE_CONTACT_READ',
      'ISSUE_ATTACHMENT_READ',
      'ISSUE_ANALYTICS_READ',
      'ISSUE_CATEGORY_MANAGE',
    ] as const) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it('keeps a citizen’s contact details behind their own grant', () => {
    // The most sensitive data this platform holds: a phone number somebody
    // volunteered on the understanding it would be used to reply to them about
    // a blocked drain. Two roles have it, and reading the backlog never implies
    // reading the people in it.
    const withContact = ROLE_KEYS.filter((role) =>
      ROLE_PERMISSIONS[role].includes('ISSUE_CONTACT_READ'),
    );
    expect(withContact.sort()).toEqual(['CAMPAIGN_ADMIN', 'ISSUE_MANAGER', 'SUPER_ADMIN'].sort());

    // A viewer sees the backlog and nothing about the people in it.
    expect(ROLE_PERMISSIONS.VIEWER).toContain('ISSUE_READ');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('ISSUE_CONTACT_READ');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('ISSUE_NOTE_READ');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('ISSUE_ATTACHMENT_READ');

    // An analyst gets aggregates and pointedly NOT the submissions themselves:
    // the free text citizens write adds nothing analytical while often
    // containing personal circumstances.
    expect(ROLE_PERMISSIONS.ANALYST).toContain('ISSUE_ANALYTICS_READ');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('ISSUE_READ');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('ISSUE_CONTACT_READ');

    // A field coordinator works the case without being handed the citizen.
    expect(ROLE_PERMISSIONS.FIELD_COORDINATOR).toContain('ISSUE_STATUS_UPDATE');
    expect(ROLE_PERMISSIONS.FIELD_COORDINATOR).toContain('ISSUE_ATTACHMENT_READ');
    expect(ROLE_PERMISSIONS.FIELD_COORDINATOR).not.toContain('ISSUE_CONTACT_READ');

    // A content manager runs the website, not the inbox.
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER.filter((p) => p.startsWith('ISSUE_'))).toEqual([]);
  });

  it('includes the Phase 4 QR permissions, and no individual-profiling one', () => {
    for (const permission of [
      'QR_CAMPAIGN_READ',
      'QR_CAMPAIGN_CREATE',
      'QR_CAMPAIGN_UPDATE',
      'QR_CAMPAIGN_ARCHIVE',
      'QR_CODE_READ',
      'QR_CODE_CREATE',
      'QR_CODE_UPDATE',
      'QR_CODE_ARCHIVE',
      'QR_CODE_DOWNLOAD',
      'QR_ANALYTICS_READ',
    ] as const) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it('separates QR viewing from QR analytics and from QR lifecycle control', () => {
    // A viewer may see that codes exist but not how they performed, and may
    // not change anything.
    expect(ROLE_PERMISSIONS.VIEWER).toContain('QR_CODE_READ');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('QR_ANALYTICS_READ');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('QR_CODE_ARCHIVE');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('QR_CODE_CREATE');

    // An analyst reads performance but cannot author or retire a code.
    expect(ROLE_PERMISSIONS.ANALYST).toContain('QR_ANALYTICS_READ');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('QR_CODE_CREATE');
    expect(ROLE_PERMISSIONS.ANALYST).not.toContain('QR_CODE_ARCHIVE');

    // A content manager authors codes but cannot activate or pause one.
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).toContain('QR_CODE_CREATE');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('QR_CODE_ARCHIVE');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('QR_CAMPAIGN_ARCHIVE');

    // A field coordinator prints codes but cannot edit them.
    expect(ROLE_PERMISSIONS.FIELD_COORDINATOR).toContain('QR_CODE_DOWNLOAD');
    expect(ROLE_PERMISSIONS.FIELD_COORDINATOR).not.toContain('QR_CODE_UPDATE');

    // Only a campaign admin holds the lifecycle permissions.
    expect(ROLE_PERMISSIONS.CAMPAIGN_ADMIN).toContain('QR_CODE_ARCHIVE');
    expect(ROLE_PERMISSIONS.CAMPAIGN_ADMIN).toContain('QR_CAMPAIGN_ARCHIVE');
  });

  it('includes the Phase 3 CMS permissions', () => {
    for (const permission of [
      'PROJECT_CREATE',
      'PROJECT_PUBLISH',
      'NEWS_PUBLISH',
      'ACHIEVEMENT_VERIFY',
      'MEDIA_CREATE',
      'CONTENT_READ_UNPUBLISHED',
    ]) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it('withholds publishing from CONTENT_MANAGER but grants editing', () => {
    // The editorial split: prepare anything, publish nothing.
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).toContain('PROJECT_CREATE');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).toContain('CONTENT_READ_UNPUBLISHED');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('PROJECT_PUBLISH');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('NEWS_PUBLISH');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('ACHIEVEMENT_VERIFY');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('PROJECT_DELETE');

    expect(ROLE_PERMISSIONS.CAMPAIGN_ADMIN).toContain('PROJECT_PUBLISH');
    expect(ROLE_PERMISSIONS.CAMPAIGN_ADMIN).toContain('ACHIEVEMENT_VERIFY');
  });

  it('gives read-only roles no CMS access at all', () => {
    for (const role of ['VIEWER', 'ANALYST'] as RoleKey[]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('CONTENT_READ_UNPUBLISHED');
      expect(ROLE_PERMISSIONS[role]).not.toContain('PROJECT_CREATE');
      expect(ROLE_PERMISSIONS[role]).not.toContain('MEDIA_CREATE');
    }
  });

  it('de-duplicates permissions across several roles', () => {
    const combined = permissionsForRoles(['VIEWER', 'ANALYST']);
    expect(new Set(combined).size).toBe(combined.length);
  });
});

describe('role ranks', () => {
  it('orders authority so admins outrank everyone they manage', () => {
    expect(ROLE_RANK.SUPER_ADMIN).toBeGreaterThan(ROLE_RANK.CAMPAIGN_ADMIN);
    expect(ROLE_RANK.CAMPAIGN_ADMIN).toBeGreaterThan(ROLE_RANK.CONTENT_MANAGER);
    expect(ROLE_RANK.ANALYST).toBeGreaterThan(ROLE_RANK.VIEWER);
  });

  it('takes the highest rank when a user holds several roles', () => {
    expect(highestRank(['VIEWER', 'CAMPAIGN_ADMIN'])).toBe(ROLE_RANK.CAMPAIGN_ADMIN);
    expect(highestRank([])).toBe(0);
  });
});

describe('requirePermission', () => {
  it('throws UNAUTHENTICATED for an anonymous caller', () => {
    expect(() => authorizationService.requirePermission(null, 'USER_READ')).toThrow(AppError);

    try {
      authorizationService.requirePermission(null, 'USER_READ');
    } catch (error) {
      expect((error as AppError).code).toBe('UNAUTHENTICATED');
    }
  });

  it('throws FORBIDDEN when authenticated but unauthorised', () => {
    try {
      authorizationService.requirePermission(contextFor(['VIEWER']), 'USER_READ');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
  });

  it('passes when the permission is held', () => {
    const context = contextFor(['CAMPAIGN_ADMIN']);
    expect(authorizationService.requirePermission(context, 'USER_READ')).toBe(context);
  });

  it('never names the missing permission in the message', () => {
    try {
      authorizationService.requirePermission(contextFor(['VIEWER']), 'AUDIT_READ');
    } catch (error) {
      expect((error as AppError).message).not.toContain('AUDIT_READ');
    }
  });
});

describe('requireOrganization', () => {
  it('rejects a request with no resolved tenant', () => {
    const context = contextFor(['CAMPAIGN_ADMIN'], { organizationId: null });
    expect(() => authorizationService.requireOrganization(context)).toThrow(AppError);
  });

  it('returns the tenant when one is resolved', () => {
    const result = authorizationService.requireOrganization(contextFor(['CAMPAIGN_ADMIN']));
    expect(result.organizationId).toBe('org-1');
  });
});

describe('assertCanGrantRole', () => {
  it('lets only a platform admin grant SUPER_ADMIN', () => {
    expect(() =>
      authorizationService.assertCanGrantRole(contextFor(['SUPER_ADMIN']), 'SUPER_ADMIN'),
    ).not.toThrow();

    expect(() =>
      authorizationService.assertCanGrantRole(contextFor(['CAMPAIGN_ADMIN']), 'SUPER_ADMIN'),
    ).toThrow(AppError);
  });

  it('refuses to grant a role of equal rank', () => {
    expect(() =>
      authorizationService.assertCanGrantRole(contextFor(['CAMPAIGN_ADMIN']), 'CAMPAIGN_ADMIN'),
    ).toThrow(AppError);

    // Equal-rank siblings are refused too, not just the identical key.
    expect(() =>
      authorizationService.assertCanGrantRole(contextFor(['CONTENT_MANAGER']), 'ISSUE_MANAGER'),
    ).toThrow(AppError);
  });

  it('allows granting a strictly lower-ranked role', () => {
    for (const role of ['CANDIDATE', 'CONTENT_MANAGER', 'ANALYST', 'VIEWER'] as RoleKey[]) {
      expect(() =>
        authorizationService.assertCanGrantRole(contextFor(['CAMPAIGN_ADMIN']), role),
      ).not.toThrow();
    }
  });

  it('lets a platform admin grant anything', () => {
    for (const role of ROLE_KEYS) {
      expect(() =>
        authorizationService.assertCanGrantRole(contextFor(['SUPER_ADMIN']), role),
      ).not.toThrow();
    }
  });

  it('refuses every grant from a role with no authority', () => {
    for (const role of ROLE_KEYS) {
      expect(() => authorizationService.assertCanGrantRole(contextFor(['VIEWER']), role)).toThrow(
        AppError,
      );
    }
  });
});

describe('assertNotSelfTargeted', () => {
  it('blocks acting on oneself', () => {
    expect(() =>
      authorizationService.assertNotSelfTargeted(contextFor(['CAMPAIGN_ADMIN']), 'user-1'),
    ).toThrow(AppError);
  });

  it('permits acting on somebody else', () => {
    expect(() =>
      authorizationService.assertNotSelfTargeted(contextFor(['CAMPAIGN_ADMIN']), 'user-2'),
    ).not.toThrow();
  });
});

describe('requirePlatformAdmin', () => {
  it('admits only a platform admin', () => {
    expect(() =>
      authorizationService.requirePlatformAdmin(contextFor(['SUPER_ADMIN'])),
    ).not.toThrow();

    expect(() => authorizationService.requirePlatformAdmin(contextFor(['CAMPAIGN_ADMIN']))).toThrow(
      AppError,
    );
  });
});

describe('can', () => {
  it('reports permission without throwing', () => {
    expect(authorizationService.can(contextFor(['CAMPAIGN_ADMIN']), 'USER_READ')).toBe(true);
    expect(authorizationService.can(contextFor(['VIEWER']), 'USER_READ')).toBe(false);
    expect(authorizationService.can(null, 'USER_READ')).toBe(false);
  });
});
