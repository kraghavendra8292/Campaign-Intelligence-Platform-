import {
  NOTIFICATION_TEMPLATE_VARIABLES,
  NOTIFICATION_TEMPLATE_VERSIONS,
  PUBLIC_STATUS_LABELS,
  type NotificationEvent,
  type NotificationTemplateVariable,
} from '@rk/types';

/**
 * Every message the platform can send, and the renderer that fills them in.
 *
 * FIXED CONSTANTS IN SOURCE, not rows in a table. There is deliberately no
 * admin-authored template and no template editor anywhere in Phase 8, because
 * an editable template is a text field whose contents are emailed to members of
 * the public - which is precisely the capability that would turn an issue
 * follow-up system into a campaign mailing tool. The one piece of staff-written
 * prose that can reach a citizen is a PUBLIC UPDATE, which is attached to one
 * issue, permissioned, audited and visible on that issue's own page.
 *
 * ---------------------------------------------------------------------------
 * THE VARIABLE ALLOW-LIST
 * ---------------------------------------------------------------------------
 *
 * `render` rejects any placeholder not in `NOTIFICATION_TEMPLATE_VARIABLES`.
 * That is not belt-and-braces: it is the control that stops a future edit to a
 * template string from introducing `{{contactPhone}}` and emailing a citizen's
 * own number back to them, or worse, to a stale address. A leak of that shape
 * cannot be introduced by editing a template alone - the variable has to be
 * added to the shared allow-list too, which is a visible decision in a file
 * whose whole comment explains why not to.
 *
 * Note what the templates never mention: the citizen's name, the issue TITLE or
 * DESCRIPTION, staff names, internal notes, priority, or any AI output. The
 * title in particular is excluded because a citizen wrote it and sometimes
 * fills it with personal circumstance, and an email subject line is the least
 * private place on the internet.
 *
 * TONE. Every message is a factual statement about the reader's own report.
 * None asks for anything, none mentions a candidate, an election, or a party,
 * and none contains a call to action beyond "view your issue" and "stop these
 * emails".
 */

export interface TemplateContext {
  readonly issueReference: string;
  readonly status: string;
  readonly categoryLabel: string | null;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
  readonly organizationName: string;
  readonly trackingUrl: string;
  readonly unsubscribeUrl: string;
  /** The staff-authored note, for a publication event. */
  readonly publicUpdate?: string | null;
}

export interface NotificationTemplate {
  readonly version: string;
  readonly subject: string;
  readonly body: string;
}

/** A date as a citizen would write it. */
function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The footer every message carries.
 *
 * The unsubscribe link is not optional and is not buried: a citizen who no
 * longer wants these must be able to stop them from the message itself, without
 * finding their reference or logging into anything.
 */
function footer(context: TemplateContext): string {
  return [
    '',
    `View your submission: ${context.trackingUrl}`,
    `Stop receiving updates about this submission: ${context.unsubscribeUrl}`,
    '',
    `This message is about submission ${context.issueReference} only.`,
    `Sent by ${context.organizationName}.`,
  ].join('\n');
}

/**
 * The five templates. One per event, and the event list is closed.
 *
 * Written as functions of a typed context rather than as strings with
 * placeholders, so an unknown variable is a compile error rather than a runtime
 * one. `render` below still performs the allow-list check, because a future
 * template might be built by string concatenation and the structural guarantee
 * should not depend on everybody continuing to write them this way.
 */
const TEMPLATES: Record<NotificationEvent, (context: TemplateContext) => NotificationTemplate> = {
  ISSUE_RECEIVED: (context) => ({
    version: NOTIFICATION_TEMPLATE_VERSIONS.ISSUE_RECEIVED,
    subject: `We have received your submission ${context.issueReference}`,
    body: [
      `Your submission ${context.issueReference} has been received.`,
      '',
      context.categoryLabel ? `Category: ${context.categoryLabel}` : null,
      `Received: ${formatDate(context.submittedAt)}`,
      '',
      'It is now waiting to be reviewed. We will let you know when its status changes.',
      footer(context),
    ]
      .filter((line) => line !== null)
      .join('\n'),
  }),

  ISSUE_STATUS_CHANGED: (context) => ({
    version: NOTIFICATION_TEMPLATE_VERSIONS.ISSUE_STATUS_CHANGED,
    subject: `Update on your submission ${context.issueReference}`,
    body: [
      `The status of your submission ${context.issueReference} has changed.`,
      '',
      `Current status: ${PUBLIC_STATUS_LABELS[context.status] ?? context.status}`,
      `Last updated: ${formatDate(context.updatedAt)}`,
      footer(context),
    ].join('\n'),
  }),

  PUBLIC_UPDATE_PUBLISHED: (context) => ({
    version: NOTIFICATION_TEMPLATE_VERSIONS.PUBLIC_UPDATE_PUBLISHED,
    subject: `A new update on your submission ${context.issueReference}`,
    body: [
      `There is a new update on your submission ${context.issueReference}.`,
      '',
      // The one place staff prose enters an outbound message. It was written
      // for this citizen, on this issue, by somebody holding
      // COMMUNICATION_PUBLISH, and it is already visible on the public page.
      context.publicUpdate ?? '',
      '',
      `Current status: ${PUBLIC_STATUS_LABELS[context.status] ?? context.status}`,
      footer(context),
    ].join('\n'),
  }),

  ISSUE_RESOLVED: (context) => ({
    version: NOTIFICATION_TEMPLATE_VERSIONS.ISSUE_RESOLVED,
    subject: `Your submission ${context.issueReference} has been marked resolved`,
    body: [
      `Your submission ${context.issueReference} has been marked as resolved.`,
      '',
      `Resolved on: ${formatDate(context.updatedAt)}`,
      '',
      'If the problem has not actually been fixed, you can tell us on the',
      'submission page and we will look at it again.',
      footer(context),
    ].join('\n'),
  }),

  ISSUE_REOPENED: (context) => ({
    version: NOTIFICATION_TEMPLATE_VERSIONS.ISSUE_REOPENED,
    subject: `Your submission ${context.issueReference} has been reopened`,
    body: [
      `Your submission ${context.issueReference} has been reopened and is being`,
      'looked at again.',
      '',
      `Current status: ${PUBLIC_STATUS_LABELS[context.status] ?? context.status}`,
      footer(context),
    ].join('\n'),
  }),
};

const ALLOWED = new Set<string>(NOTIFICATION_TEMPLATE_VARIABLES);

/** Matches `{{ anything }}` so a stray placeholder is caught rather than sent. */
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

/**
 * Renders one event into a message.
 *
 * THE ALLOW-LIST CHECK RUNS ON THE OUTPUT, not the input. That ordering is the
 * point: it catches a placeholder that survived into the rendered text - either
 * because a template was written with `{{...}}` syntax and never substituted,
 * or because a value itself contained one. A message containing a literal
 * `{{contactEmail}}` reaching a citizen would be embarrassing; one where that
 * placeholder had been filled would be a breach.
 *
 * Throws rather than sending. The caller records the notification as FAILED
 * with a safe reason; nothing is delivered half-rendered.
 */
export function renderNotification(
  event: NotificationEvent,
  context: TemplateContext,
): NotificationTemplate {
  const template = TEMPLATES[event](context);

  for (const text of [template.subject, template.body]) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
      const name = match[1] ?? '';
      // An unfilled placeholder is a bug either way; an unfilled placeholder
      // naming something outside the allow-list is a bug that was trying to
      // leak. Both stop the send.
      if (!ALLOWED.has(name)) {
        throw new TemplateRenderError(
          `Template ${template.version} referenced the disallowed variable "${name}".`,
        );
      }
      throw new TemplateRenderError(
        `Template ${template.version} left the variable "${name}" unrendered.`,
      );
    }
  }

  if (template.body.trim().length === 0 || template.subject.trim().length === 0) {
    throw new TemplateRenderError(`Template ${template.version} rendered empty content.`);
  }

  return template;
}

/** Exported for the test that asserts the allow-list is actually enforced. */
export function isAllowedTemplateVariable(name: string): name is NotificationTemplateVariable {
  return ALLOWED.has(name);
}
