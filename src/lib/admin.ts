const ADMIN_EMAILS_KEY = 'ADMIN_EMAILS';

export function isAdminUser(email: string | undefined): boolean {
  if (!email) return false;

  const adminEmails = process.env[ADMIN_EMAILS_KEY];
  if (!adminEmails) return false;

  const allowedEmails = adminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowedEmails.includes(email.toLowerCase());
}
