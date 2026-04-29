import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { generateObserverToken, buildObserverUrl } from '@/lib/observer-utils';
import { canAccess, type Tier } from '@/lib/tier';

export async function POST(request: Request) {
  const supabase = await createServiceSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Observer links share session capture access with non-coaches (parent
  // volunteers); same gate as parent_sharing — every paid plan includes it.
  const { data: gateCoach } = await supabase
    .from('coaches')
    .select('organizations(tier)')
    .eq('id', user.id)
    .single();
  const gateTier = (((gateCoach as any)?.organizations?.tier) || 'free') as Tier;
  if (!canAccess(gateTier, 'parent_sharing')) {
    return NextResponse.json(
      { error: 'Observer links require a paid plan. Upgrade to share session capture with assistants and parents.', upgrade: true, currentTier: gateTier },
      { status: 402 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { sessionId } = body as { sessionId?: string };

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // Verify coach owns or is a member of the session's team
  const { data: session } = await supabase
    .from('sessions')
    .select('id, team_id, type, date')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: teamCoach } = await supabase
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', session.team_id)
    .eq('coach_id', user.id)
    .single();

  if (!teamCoach) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = generateObserverToken(sessionId, 24);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get('origin') ||
    '';
  const url = buildObserverUrl(token, appUrl);

  return NextResponse.json({ token, url, expiresIn: '24 hours' });
}
