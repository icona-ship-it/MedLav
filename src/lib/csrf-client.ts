/**
 * Read the CSRF token from the `csrf-token` cookie (set by middleware).
 */
export function getCsrfToken(): string {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf-token='));
  return match ? match.split('=')[1] ?? '' : '';
}

/**
 * Return headers object containing the CSRF token for use in fetch() calls.
 */
export function csrfHeaders(): Record<string, string> {
  return { 'x-csrf-token': getCsrfToken() };
}
