import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface PlayerInput {
  name: string;
  /** Optional pronunciation hints — fed to the AI segmentation prompt as "sounds like" cues. */
  name_variants?: string[];
  /** True when this player is seeded as part of a "try with sample players" flow. */
  is_sample?: boolean;
}

const SAMPLE_NAMES = [
  'Sample · Alex',
  'Sample · Jordan',
  'Sample · Riley',
  'Sample · Sam',
  'Sample · Casey',
  'Sample · Drew',
  'Sample · Quinn',
  'Sample · Taylor',
];

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Accept either { players: PlayerInput[] } (new), { playerNames: string[] } (legacy),
  // or { sample: true } to seed 8 fictional sample players.
  let players: PlayerInput[] = [];
  if (body.sample === true) {
    players = SAMPLE_NAMES.map((name) => ({ name, is_sample: true }));
  } else if (Array.isArray(body.players)) {
    players = body.players
      .map((p: any): PlayerInput | null => {
        if (!p || typeof p.name !== 'string' || !p.name.trim()) return null;
        const variants = Array.isArray(p.name_variants)
          ? p.name_variants
              .map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
              .filter((v: string) => v.length > 0 && v.length <= 60)
              .slice(0, 5)
          : [];
        return {
          name: p.name.trim(),
          name_variants: variants,
          is_sample: p.is_sample === true,
        };
      })
      .filter((p: PlayerInput | null): p is PlayerInput => p !== null);
  } else if (Array.isArray(body.playerNames)) {
    players = body.playerNames
      .filter((n: unknown) => typeof n === 'string' && n.trim())
      .map((n: string) => ({ name: n.trim() }));
  }

  if (players.length === 0) return NextResponse.json({ success: true, count: 0 });

  const admin = await createServiceSupabase();

  // Get the coach's first team
  const { data: teamCoach } = await admin.from('team_coaches')
    .select('team_id, teams(age_group)')
    .eq('coach_id', user.id)
    .limit(1)
    .single();

  if (!teamCoach) return NextResponse.json({ error: 'No team found' }, { status: 404 });

  const ageGroup = (teamCoach as any).teams?.age_group || '8-10';

  const { error } = await admin.from('players').insert(
    players.map((p) => ({
      team_id: teamCoach.team_id,
      name: p.name,
      age_group: ageGroup,
      name_variants: p.name_variants && p.name_variants.length > 0 ? p.name_variants : null,
      is_sample: p.is_sample === true,
    }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, count: players.length });
}
