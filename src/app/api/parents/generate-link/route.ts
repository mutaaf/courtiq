import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { generateContactToken, buildContactUrl, buildShareMessage } from '@/lib/parent-contact-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { teamId } = body as { teamId?: string };
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 });

  const admin = await createServiceSupabase();

  // Verify the requesting coach belongs to this team
  const [{ data: asOwner }, { data: asMember }] = await Promise.all([
    admin.from('teams').select('id').eq('id', teamId).eq('coach_id', user.id).single(),
    admin.from('team_coaches').select('coach_id').eq('team_id', teamId).eq('coach_id', user.id).single(),
  ]);
  if (!asOwner && !asMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get team name + coach first name for the share message
  const { data: team } = await admin
    .from('teams')
    .select('name, coaches(full_name)')
    .eq('id', teamId)
    .single();

  const teamName = team?.name ?? 'My Team';
  const coachName = (team as any)?.coaches?.full_name ?? null;
  const coachFirst = coachName ? coachName.split(' ')[0] : null;

  const token = generateContactToken(teamId, 7);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get('origin') ||
    '';
  const url = buildContactUrl(token, appUrl);
  const shareText = buildShareMessage(teamName, coachFirst, url);

  return NextResponse.json({ token, url, shareText });
}
