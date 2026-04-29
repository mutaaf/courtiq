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
  /** Override the default sender; otherwise EMAIL_FROM env or hardcoded fallback. */
  from?: string;
  /**
   * One-click List-Unsubscribe URL (RFC 8058). Adds the header that Gmail and
   * iCloud reward with better deliverability for marketing-shaped emails.
   * Pass null/undefined for transactional emails (auth confirms, billing).
   */
  unsubscribeUrl?: string;
  /**
   * Tag the message in Resend for filtering / reputation tracking. e.g.
   * 'welcome', 'weekly_digest', 'parent_share'.
   */
  tag?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

// Root-domain sender beats the `connect.` subdomain for inbox placement on
// iCloud and Gmail. Override via EMAIL_FROM env if needed for staging.
const FROM_DEFAULT = process.env.EMAIL_FROM || 'SportsIQ <coach@youthsportsiq.com>';
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

  // List-Unsubscribe is a strong deliverability signal. Gmail/iCloud will
  // accept either `mailto:` or an `https://` URL; one-click requires the
  // POST header. We send both for maximum compatibility.
  const headers: Record<string, string> = {};
  if (payload.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${payload.unsubscribeUrl}>, <mailto:unsubscribe@youthsportsiq.com>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
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
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(payload.tag ? { tags: [{ name: 'category', value: payload.tag }] } : {}),
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
