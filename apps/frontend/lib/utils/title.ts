/**
 * Fix 7: Frontend title sanitization — defense-in-depth guard against
 * reasoning-model CoT text leaking into the displayed resume title.
 *
 * Valid titles pass through unchanged.  Strings that look like reasoning output
 * are replaced with null so the UI falls back to the placeholder text.
 */

const REASONING_PREFIXES: string[] = [
  'we need to',
  'i need to',
  'let me',
  'first,',
  'first ',
  'the description',
  'analyzing',
  'looking at',
  'based on',
  'i will',
  "i'll",
  'to extract',
  'sure,',
  'certainly',
  'okay,',
  'ok,',
  'the job',
  "here's",
  'here is',
  'alright',
  'step 1',
];

/**
 * Sanitize a resume title for display.
 *
 * Returns null when the title is missing, blank, or looks like reasoning text
 * so the caller can render a placeholder instead.
 *
 * @param title - Raw title string from the backend (may be null/undefined).
 * @returns Sanitized title string, or null if the value should be hidden.
 */
export function sanitizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;

  const trimmed = title.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const isReasoning = REASONING_PREFIXES.some((prefix) => lower.startsWith(prefix));
  if (isReasoning) return null;

  // Truncate overly long strings (shouldn't normally happen with backend validation)
  if (trimmed.length > 80) {
    return trimmed.slice(0, 77) + '...';
  }

  return trimmed;
}
