// Objectionable-content filter for user-generated text.
//
// Required by App Store Guideline 1.2: apps with user-generated content must
// include "a method for filtering objectionable material from being posted to
// the app". Everything a user can type into OpenCircle and other people can
// then read — event names, descriptions, chat messages, display names, bios —
// goes through screenText() before it is written.
//
// Pure functions only, no network: this file is unit-tested directly and is
// also cheap enough to call on every keystroke.

export type Severity = 'clean' | 'profanity' | 'severe';

export type ScreenResult = {
  /** false when the text must not be posted. */
  ok: boolean;
  severity: Severity;
  /** The normalized term that tripped the filter, for the moderation log. */
  matched?: string;
  /** User-facing explanation. Deliberately does not echo the matched term. */
  message?: string;
};

// ── Term lists ───────────────────────────────────────────────────────────────
//
// Every term is matched on word boundaries, never as a bare substring. That
// distinction matters more than it looks: "grape", "raccoon", "suspicious",
// "torpedo", "Pakistan" and "document" all contain a term from these lists,
// and a substring match would flag every one of them.

// Slurs and single-word severe terms. Boundary-matched.
const SEVERE_WORDS = [
  // Racial, ethnic, and religious slurs
  'nigger', 'nigga', 'niggers', 'chink', 'gook', 'kike', 'spic', 'wetback',
  'beaner', 'towelhead', 'raghead', 'coon', 'jigaboo', 'zipperhead',
  // Homophobic and transphobic slurs
  'faggot', 'faggots', 'fag', 'dyke', 'tranny', 'shemale',
  // Ableist slurs
  'retard', 'retarded', 'mongoloid',
  // Sexual content involving minors
  'lolicon', 'shotacon', 'pedo', 'pedophile', 'jailbait',
  // Sexual violence
  'rape', 'raping', 'rapist', 'molest', 'molester',
];

// Multi-word threats and phrases. These are matched against the text with all
// separators removed, so "k.i.l.l y o u r s e l f" is caught too. Safe to do
// here because each is long and distinctive enough not to collide with a real
// word the way a three-letter slur would.
const SEVERE_PHRASES = [
  'killyourself', 'killurself', 'killyrself', 'hangyourself', 'endyourself',
  'iwillkillyou', 'imgoingtokillyou', 'illkillyou', 'gonnakillyou',
  'iwillfindyou', 'iwillhurtyou', 'illhurtyou', 'iwillrapeyou',
  'childporn', 'childpornography', 'underagesex', 'minorsex', 'cporn',
  'shootupthe', 'bombthe', 'schoolshooting',
];

// Short severe terms that only make sense as standalone words. Kept separate
// from SEVERE_WORDS so they are never phrase-matched.
const SEVERE_STANDALONE = ['kys', 'kysrn'];

const PROFANITY_TERMS = [
  'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker', 'fuk', 'fuq', 'fck',
  'shit', 'shitty', 'bullshit', 'shithead',
  'bitch', 'bitches', 'bastard', 'cunt', 'twat',
  'asshole', 'arsehole', 'dickhead', 'jackass', 'dumbass',
  'cock', 'dick', 'prick', 'pussy', 'wanker', 'bollocks',
  'whore', 'slut', 'skank',
  'jerkoff', 'jizz', 'blowjob', 'handjob', 'deepthroat',
  'porn', 'porno', 'pornhub', 'onlyfans',
  'goddamn', 'piss', 'pissed',
];

// ── Normalization ────────────────────────────────────────────────────────────

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i', '|': 'l',
};

/**
 * Fold the text down to a comparable form: strip accents, undo common
 * letter/digit substitutions, and collapse padded-out repeats ("fuuuuck").
 * Word separators are preserved so callers can still match on boundaries.
 */
export function normalize(input: string): string {
  const deaccented = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  const unleeted = deaccented.replace(/[013457@$!|]/g, (c) => LEET[c] ?? c);

  // "fuuuuck" -> "fuuck": collapse to two so real doubles ("pass") survive.
  return unleeted.replace(/(.)\1{2,}/g, '$1$1');
}

/** Normalized text with every non-letter removed. Used for phrase matching. */
function flatten(normalizedText: string): string {
  return normalizedText.replace(/[^a-z]/g, '');
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const termRegexCache = new Map<string, RegExp>();

/**
 * Build the matcher for one term. Three things are tolerated inside the word:
 * repeated letters ("fuuck", left over from normalize), up to two separator
 * characters between letters ("f.u.c.k", "f a g g o t"), and a plural suffix.
 *
 * The anchoring word boundaries are what keep this safe — they are the only
 * reason "grape", "therapist", "raccoon", "suspicious" and "cocktail" do not
 * match 'rape', 'rapist', 'coon', 'spic' and 'cock'.
 */
function termRegex(term: string): RegExp {
  const cached = termRegexCache.get(term);
  if (cached) return cached;

  const body = term
    .split('')
    .map((ch) => `${escapeRegex(ch)}+`)
    .join('[^a-z0-9]{0,2}');

  const built = new RegExp(`\\b${body}(?:es|s)?\\b`);
  termRegexCache.set(term, built);
  return built;
}

function matchesWord(haystack: string, term: string): boolean {
  return termRegex(term).test(haystack);
}

// ── Public API ───────────────────────────────────────────────────────────────

const CLEAN: ScreenResult = { ok: true, severity: 'clean' };

const SEVERE_MESSAGE =
  'This contains hate speech, threats, or sexual content, which is not allowed on OpenCircle. Repeat attempts will result in your account being removed.';

const PROFANITY_MESSAGE =
  'Please reword this without offensive language. OpenCircle has no tolerance for objectionable content.';

/**
 * Screen a piece of user-generated text before it is posted.
 *
 * Returns ok:false when the text must be rejected, along with a message to
 * show the user and the term that matched, for the moderation log.
 */
export function screenText(input: string): ScreenResult {
  if (!input || !input.trim()) return CLEAN;

  const normalized = normalize(input);
  const flat = flatten(normalized);

  const hitsWord = (term: string) => matchesWord(normalized, term);

  for (const term of [...SEVERE_WORDS, ...SEVERE_STANDALONE]) {
    if (hitsWord(term)) {
      return { ok: false, severity: 'severe', matched: term, message: SEVERE_MESSAGE };
    }
  }

  for (const phrase of SEVERE_PHRASES) {
    if (flat.includes(phrase)) {
      return { ok: false, severity: 'severe', matched: phrase, message: SEVERE_MESSAGE };
    }
  }

  for (const term of PROFANITY_TERMS) {
    if (hitsWord(term)) {
      return { ok: false, severity: 'profanity', matched: term, message: PROFANITY_MESSAGE };
    }
  }

  return CLEAN;
}

/** Convenience wrapper for callers that only need a yes/no. */
export function isObjectionable(input: string): boolean {
  return !screenText(input).ok;
}

/**
 * Screen several fields at once and return the first problem found, tagged
 * with which field failed. Used by the event composer, where the name and
 * description are submitted together.
 */
export function screenFields(
  fields: Record<string, string>,
): ScreenResult & { field?: string } {
  for (const [field, value] of Object.entries(fields)) {
    const result = screenText(value);
    if (!result.ok) return { ...result, field };
  }
  return CLEAN;
}

/**
 * Replace flagged terms with asterisks. Used for content that predates the
 * filter, which is already stored and can only be masked at render time.
 */
export function maskText(input: string): string {
  if (!input) return input;

  const terms = [...SEVERE_WORDS, ...SEVERE_STANDALONE, ...PROFANITY_TERMS];
  let output = input;

  for (const term of terms) {
    const global = new RegExp(termRegex(term).source, 'gi');
    output = output.replace(global, (match) => '*'.repeat(match.length));
  }
  return output;
}
