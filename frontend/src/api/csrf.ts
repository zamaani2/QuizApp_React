/**
 * Retrieve the CSRF token from document.cookie set by Django.
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    if (name === 'csrftoken') {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}
