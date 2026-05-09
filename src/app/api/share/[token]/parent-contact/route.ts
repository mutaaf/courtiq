import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

// ─── POST /api/share/[token]/parent-contact ───────────────────────────────────
// Parents submit their contact info directly from the share portal.
// Validated against the parent_shares table — no HMAC token required.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required.' }, { status: 400 });
  }

  let body: { parentName?: string; parentPhone?: string; parentEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { parentName, parentPhone, parentEmail } = body;

  if (!parentName?.trim()) {
    return NextResponse.json({ error: 'Your name is required.' }, { status: 422 });
  }
  if (!parentPhone || !isValidPhone(parentPhone)) {
    return NextResponse.json({ error: 'A valid WhatsApp/mobile number is required.' }, { status: 422 });
  }

  const admin = await createServiceSupabase();

  // Validate token against the parent_shares table (public route — no auth header)
  const { data: share } = await admin
    .from('parent_shares')
    .select('player_id, is_active, expires_at')
    .eq('share_token', token)
    .eq('is_active', true)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'Share link not found or inactive.' }, { status: 404 });
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired.' }, { status: 410 });
  }

  const { error: updateErr } = await admin
    .from('players')
    .update({
      parent_name: parentName.trim(),
      parent_phone: normalizePhone(parentPhone),
      parent_email: parentEmail?.trim() || null,
    })
    .eq('id', share.player_id);

  if (updateErr) {
    console.error('[share/parent-contact] update error:', updateErr);
    return NextResponse.json({ error: 'Failed to save. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
