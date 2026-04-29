/**
 * Unified email design system for SportsIQ.
 *
 * One layout, one header, one footer, one button style. Every transactional
 * and lifecycle email — welcome, trial-ending, parent share, weekly digest,
 * etc. — pipes its body through `renderEmail()` so the brand stays
 * coherent and we only debug rendering bugs in one place.
 *
 * Tailored for inbox dark-mode quirks (Apple Mail / Outlook): inline styles
 * only, no external assets, light background that reads well in both
 * Outlook's light/dark color schemes, and a minimum 600px wide body that
 * Gmail won't squish.
 */

const BRAND = {
  orange: '#f97316',
  orangeDark: '#c2410c',
  orangeLight: '#fff7ed',
  ink: '#0f172a',
  body: '#475569',
  muted: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  card: '#ffffff',
} as const;

export interface RenderEmailArgs {
  /** Plain-text title — also used as the document <title> */
  preview: string;
  /** Inner HTML for the body — typically built with the helpers below */
  body: string;
  /** Optional custom footer line (defaults to standard one) */
  footer?: string;
  /** When true, hides the unsubscribe link (e.g. for password-reset) */
  transactional?: boolean;
}

/**
 * Wrap a body fragment in the SportsIQ shell. Pass HTML strings built with
 * the helpers below (heroSection, ctaButton, statRow, etc.).
 */
export function renderEmail({ preview, body, footer, transactional }: RenderEmailArgs): string {
  const footerText = footer ?? defaultFooter(!!transactional);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(preview)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.ink};-webkit-font-smoothing:antialiased;">
  <!-- Preview text — shown by Gmail/Apple Mail in the inbox preview -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg};">${escapeHtml(preview)}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="background:${BRAND.orange};border-radius:8px;width:36px;height:36px;text-align:center;color:#fff;font-weight:800;font-size:20px;line-height:36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">S</td>
                        <td style="padding-left:10px;font-weight:700;font-size:18px;color:${BRAND.ink};">SportsIQ</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;padding:32px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 8px 0;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};text-align:center;">
                ${footerText}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Body helpers ────────────────────────────────────────────────────────────

/** Big headline + supporting paragraph at the top of the card. */
export function heroSection(title: string, subtitle?: string): string {
  return `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.ink};">${escapeHtml(title)}</h1>
    ${
      subtitle
        ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${BRAND.body};">${escapeHtml(subtitle)}</p>`
        : ''
    }
  `;
}

/** Body paragraph — pass `html: true` if the content is already escaped HTML. */
export function paragraph(text: string, opts: { html?: boolean } = {}): string {
  const content = opts.html ? text : escapeHtml(text);
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.body};">${content}</p>`;
}

/** Primary call-to-action — orange pill, max width on mobile. */
export function ctaButton(label: string, href: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px;">
      <tr>
        <td style="border-radius:8px;background:${BRAND.orange};">
          <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
  `;
}

/** Secondary link styled inline (use after a CTA, like "or skip ahead"). */
export function inlineLink(label: string, href: string): string {
  return `<a href="${href}" style="color:${BRAND.orangeDark};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

/** Numbered step list — used in "here's how to get started" emails. */
export function steps(items: string[]): string {
  return items
    .map(
      (item, i) => `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 12px;">
      <tr>
        <td width="32" style="vertical-align:top;padding-top:2px;">
          <div style="background:${BRAND.orangeLight};color:${BRAND.orange};font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;font-size:13px;line-height:24px;">${i + 1}</div>
        </td>
        <td style="font-size:15px;line-height:1.55;color:${BRAND.ink};vertical-align:top;">${escapeHtml(item)}</td>
      </tr>
    </table>`,
    )
    .join('');
}

/** Stat callout — "4 sessions · 18 observations · 3 standouts". */
export function statRow(stats: Array<{ label: string; value: string }>): string {
  if (stats.length === 0) return '';
  const cells = stats
    .map(
      (s) => `
    <td align="center" style="padding:0 8px;">
      <div style="font-size:24px;font-weight:700;color:${BRAND.orange};line-height:1;">${escapeHtml(s.value)}</div>
      <div style="margin-top:4px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.muted};">${escapeHtml(s.label)}</div>
    </td>`,
    )
    .join('');
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BRAND.orangeLight};border-radius:10px;margin:8px 0 24px;padding:20px 0;">
      <tr>${cells}</tr>
    </table>
  `;
}

/** Divider between sections. */
export function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:24px 0;" />`;
}

/** Small helper text (used for legal lines, "you got this email because…", etc.). */
export function fineprint(text: string): string {
  return `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(text)}</p>`;
}

// ── Default footer ──────────────────────────────────────────────────────────

function defaultFooter(transactional: boolean): string {
  if (transactional) {
    return `Sent by SportsIQ · <a href="https://youthsportsiq.com" style="color:${BRAND.muted};">youthsportsiq.com</a>`;
  }
  return `You're getting this because you signed up for SportsIQ. <br />
  <a href="https://youthsportsiq.com/settings/profile" style="color:${BRAND.muted};">Manage email preferences</a> · <a href="https://youthsportsiq.com" style="color:${BRAND.muted};">youthsportsiq.com</a>`;
}

// ── Utilities ───────────────────────────────────────────────────────────────

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
