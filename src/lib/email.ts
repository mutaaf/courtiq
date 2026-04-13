/**
 * Lightweight email sender using Resend's REST API via fetch.
 * No SDK required — just set RESEND_API_KEY in your environment.
 *
 * Falls back gracefully (logs to console) when the key is missing,
 * so development and test environments stay noise-free.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  /** Defaults to "SportsIQ <noreply@sportsiq.app>" */
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

const FROM_DEFAULT = 'SportsIQ <noreply@sportsiq.app>';
const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // In dev / test, just log the email so the drip logic can still be exercised
    console.info('[email] RESEND_API_KEY not set — skipping send', {
      to: payload.to,
      subject: payload.subject,
    });
    return { success: true, id: 'dev-noop' };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: payload.from ?? FROM_DEFAULT,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Resend ${res.status}: ${body}` };
    }

    const data = (await res.json()) as { id: string };
    return { success: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
