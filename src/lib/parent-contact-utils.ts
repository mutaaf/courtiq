import crypto from 'crypto';

function getSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    process.env.NEXTAUTH_SECRET ||
    'sportsiq-parent-contact-dev'
  );
}

export interface ContactTokenPayload {
  teamId: string;
  expires: number;
}

/** Generate a signed, time-limited token for a team's parent contact collection page.  */
export function generateContactToken(teamId: string, ttlDays = 7): string {
  const expires = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ teamId, expires })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyContactToken(token: string): ContactTokenPayload | null {
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx < 0) return null;
    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as ContactTokenPayload;
    if (!payload.teamId || !payload.expires) return null;
    if (Date.now() > payload.expires) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildContactUrl(token: string, appUrl: string): string {
  return `${appUrl}/parents/join/${encodeURIComponent(token)}`;
}

export function buildShareMessage(
  teamName: string,
  coachFirstName: string | null,
  url: string,
): string {
  const coach = coachFirstName ? `Coach ${coachFirstName}` : 'Your coach';
  return (
    `👋 ${coach} (${teamName}) uses SportsIQ to send personalized updates about your child's progress!\n\n` +
    `Tap the link to add your number so you never miss an update:\n${url}\n\n` +
    `Takes 30 seconds. No app required.`
  );
}

/** Strips non-digit characters and normalises US numbers to E.164. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/** Find the best matching player by jersey number or first-name (case-insensitive). */
export function matchPlayer(
  players: { id: string; name: string; jersey_number: number | null }[],
  jerseyRaw: string | undefined,
  firstNameRaw: string | undefined,
): { id: string; name: string } | null {
  const jersey = jerseyRaw ? parseInt(jerseyRaw, 10) : NaN;
  const firstName = firstNameRaw?.trim().toLowerCase();

  if (!isNaN(jersey)) {
    const hit = players.find((p) => p.jersey_number === jersey);
    if (hit) return { id: hit.id, name: hit.name };
  }

  if (firstName) {
    const hit = players.find((p) => p.name.split(' ')[0].toLowerCase() === firstName);
    if (hit) return { id: hit.id, name: hit.name };
    // Partial match as fallback
    const partial = players.find((p) => p.name.toLowerCase().startsWith(firstName));
    if (partial) return { id: partial.id, name: partial.name };
  }

  return null;
}
