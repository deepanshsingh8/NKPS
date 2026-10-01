/**
 * The one password-length floor for every place a user chooses a password:
 * the forced-change and reset-password forms, Settings → Change password, the
 * server route that actually writes the password
 * (/api/portal/complete-password-change), and an admin-typed password on
 * /api/users.
 *
 * Client-safe (no Node imports) so the forms can read the same number the
 * server enforces — a server floor stricter than the form's would reject a
 * password the user was just told was acceptable.
 *
 * Supabase Auth has its own "Minimum password length" setting (Authentication
 * → Providers → Email), which governs the browser-side updateUser() call on
 * the Settings page. Keep it at least this high.
 */
export const MIN_PASSWORD_LENGTH = 8;
