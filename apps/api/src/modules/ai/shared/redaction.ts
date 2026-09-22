/**
 * PII minimisation for text on its way to an AI provider.
 *
 * TWO LAYERS, AND THE FIRST IS THE IMPORTANT ONE.
 *
 * Layer 1 - FIELD SELECTION. The AI services never read `contactName`,
 * `contactPhone`, `contactEmail`, `addressDescription`, latitude or longitude
 * from an issue. The Prisma `select` clauses in this module list the fields
 * that go to a provider, and the citizen's own details are simply not among
 * them. This is what actually protects contact data: it is never loaded, so it
 * cannot leak. See `ISSUE_AI_SELECT` in `issueInsight.service.ts`.
 *
 * Layer 2 - THIS FILE. A citizen typing into a free-text description may put
 * their own phone number in the body ("please call me on 98xxxxxxxx"), and no
 * amount of careful field selection catches that. So the description is scrubbed
 * for contact-shaped strings before it is sent.
 *
 * LIMITATIONS, STATED PLAINLY BECAUSE THEY MATTER:
 *
 *  - This is pattern matching, not PII detection. It finds things SHAPED like
 *    phone numbers, emails and Indian government identifiers. It cannot find a
 *    person's NAME, and it does not try - names are indistinguishable from
 *    ordinary words without a model, and running a model to sanitise input for
 *    a model is circular.
 *  - It will over-match sometimes. A road width of "1800 122 1234" style
 *    numbering, or a long reference number, may be redacted as a phone number.
 *    Over-redaction degrades a summary slightly; under-redaction sends somebody's
 *    phone number to a third party. The bias is deliberate.
 *  - It is a MINIMISATION measure, not a guarantee. The honest statement to put
 *    in a privacy notice is that free-text may still contain personal detail a
 *    pattern cannot recognise, which is also why the provider is configured for
 *    zero-retention use and why the operation is opt-in per deployment.
 *
 * Redactions replace with a labelled placeholder rather than deleting, so the
 * model can still tell that a contact detail was present - "the resident left a
 * phone number" is sometimes the administratively relevant fact - without
 * learning what it was.
 */

/** What a redacted span is replaced with, by kind. */
const PLACEHOLDER = {
  phone: '[phone removed]',
  email: '[email removed]',
  governmentId: '[id removed]',
  url: '[link removed]',
} as const;

export type RedactionKind = keyof typeof PLACEHOLDER;

export interface RedactionResult {
  readonly text: string;
  /** Which kinds were found, for privacy telemetry. Never the values. */
  readonly redacted: readonly RedactionKind[];
  readonly redactionCount: number;
}

/**
 * Email addresses.
 *
 * Deliberately broad on the local part: an address is worth over-matching for.
 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Indian Aadhaar-shaped identifiers: twelve digits, optionally grouped.
 *
 * Checked BEFORE the phone pattern, because a bare 12-digit run would otherwise
 * be partially consumed as a phone number and leave four digits behind.
 */
const AADHAAR_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

/** PAN: five letters, four digits, one letter. */
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

/** Voter EPIC: three letters then seven digits. */
const EPIC_PATTERN = /\b[A-Z]{3}\d{7}\b/g;

/**
 * Phone numbers.
 *
 * Covers +91 and bare 10-digit Indian mobile numbers, with optional separators,
 * plus longer international forms. Requires at least 8 digits so a house number,
 * a year or a ward number is not swallowed.
 */
const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,5}(?:[\s-]?\d{2,4})?/g;

/** Minimum digit count before a numeric run is treated as a phone number. */
const PHONE_MIN_DIGITS = 8;
/** Above this, it is more likely an identifier than a phone number. */
const PHONE_MAX_DIGITS = 15;

/**
 * URLs.
 *
 * Redacted because a link can carry an identifier in its path or query, and
 * because a URL in citizen text is never load-bearing for a summary of a
 * pothole. Also removes one prompt-injection delivery route.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/**
 * Removes contact-shaped strings from free text.
 *
 * Order matters and is not arbitrary: URLs first (they can contain an email or
 * a digit run), then emails, then the structured government identifiers, then
 * phone numbers last as the broadest and least specific pattern.
 */
export function redactPersonalData(input: string | null | undefined): RedactionResult {
  if (!input) return { text: '', redacted: [], redactionCount: 0 };

  const kinds = new Set<RedactionKind>();
  let count = 0;

  const mark = (kind: RedactionKind): string => {
    kinds.add(kind);
    count += 1;
    return PLACEHOLDER[kind];
  };

  let text = input.replace(URL_PATTERN, () => mark('url'));
  text = text.replace(EMAIL_PATTERN, () => mark('email'));
  text = text.replace(AADHAAR_PATTERN, () => mark('governmentId'));
  text = text.replace(PAN_PATTERN, () => mark('governmentId'));
  text = text.replace(EPIC_PATTERN, () => mark('governmentId'));

  text = text.replace(PHONE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '').length;
    // Leave short runs alone: they are ward numbers, house numbers and years,
    // and redacting them would strip the location detail that makes a summary
    // administratively useful.
    if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) return match;
    return mark('phone');
  });

  return { text, redacted: [...kinds], redactionCount: count };
}

/**
 * Neutralises instruction-shaped text before it enters a prompt.
 *
 * PROMPT INJECTION DEFENCE, LAYER 2. Layer 1 is structural and lives in
 * `prompts/`: citizen content is passed as a JSON string value inside a clearly
 * fenced data block, with the system message stating that the block is data and
 * never instructions. That is the real control.
 *
 * This function handles the residue - text engineered to look like the end of
 * the data block or the start of a new turn. It does NOT try to detect
 * "ignore previous instructions" semantically; that is an arms race, and a
 * citizen may legitimately write "ignore the previous complaint, the real
 * problem is...". What it removes is the SYNTAX an injection needs to escape
 * its container: role markers and fence sequences.
 */
export function neutralizeInjectionSyntax(input: string): string {
  return (
    input
      // Chat role markers, which is how an injection tries to open a new turn.
      .replace(/<\|[^|>]*\|>/g, ' ')
      .replace(/^\s*(system|assistant|user|developer)\s*:/gim, ' ')
      // Fence sequences that could close the data block early.
      .replace(/```+/g, ' ')
      .replace(/-{4,}\s*(END|BEGIN)[A-Z\s]*-{4,}/gi, ' ')
      // Collapse the whitespace the substitutions leave behind.
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

/**
 * Caps text length before it becomes prompt tokens.
 *
 * A cost control and a prompt-stability control at once: a 5000-character
 * description (the Phase 5 ceiling) is far more than a two-sentence summary
 * needs, and an unbounded tail is where injection attempts tend to sit.
 * Truncation is marked so the model knows it is not seeing the whole text.
 */
export function truncateForPrompt(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars).trimEnd()} […truncated]`;
}

/**
 * The full inbound pipeline for one piece of citizen free text.
 *
 * Every path that sends citizen-authored content to a provider goes through
 * here. Having exactly one such function is the point - a second, slightly
 * different sanitiser is how the unredacted path eventually gets written.
 */
export function prepareCitizenText(
  input: string | null | undefined,
  maxChars: number,
): RedactionResult {
  const redaction = redactPersonalData(input);
  const neutralized = neutralizeInjectionSyntax(redaction.text);
  return { ...redaction, text: truncateForPrompt(neutralized, maxChars) };
}
