import { Resend } from 'resend';

let resendInstance: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendInstance) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY is not set');
    }
    resendInstance = new Resend(key);
  }
  return resendInstance;
}
