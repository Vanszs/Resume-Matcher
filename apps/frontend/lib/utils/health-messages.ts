/**
 * Shared utility for mapping LLM health check error codes to localized messages.
 * Used by both the Settings page and the Dashboard warning banner.
 */

/**
 * Look up a localized message for a health check error/warning code.
 *
 * Tries `${baseKey}.${code}` in the i18n translation function. If the key is
 * missing (i.e., the translation function returns the key itself), it falls
 * back to the provided `fallback` string or the raw code.
 *
 * @param t          Translation function from useTranslations()
 * @param baseKey    Dot-separated i18n namespace (e.g. "settings.llmConfiguration.healthErrors")
 * @param code       Error/warning code returned by the backend (e.g. "html_response")
 * @param fallback   Optional human-readable fallback when no translation exists
 * @returns          Localized message string, or null if neither code nor fallback provided
 */
export const getHealthCheckMessage = (
  t: (key: string, params?: Record<string, string | number>) => string,
  baseKey: string,
  code?: string,
  fallback?: string
): string | null => {
  if (code) {
    const key = `${baseKey}.${code}`;
    const localized = t(key);
    return localized !== key ? localized : (fallback ?? code);
  }
  return fallback ?? null;
};
