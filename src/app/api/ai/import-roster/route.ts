import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { rosterImportSchema, type RosterImport } from '@/lib/ai/schemas';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { teamId, imageUrl, imageBase64 } = body;

  if (!teamId || (!imageUrl && !imageBase64)) {
    return NextResponse.json({ error: 'teamId and imageUrl or imageBase64 required' }, { status: 400 });
  }

  try {
    const prompt = PROMPT_REGISTRY.importRoster();

    const imageContent = imageBase64
      ? `[Image provided as base64 data]\n\ndata:image/jpeg;base64,${imageBase64}`
      : `[Image URL: ${imageUrl}]`;

    const result = await callAIWithJSON<RosterImport>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'roster_import',
        systemPrompt: prompt.system,
        userPrompt: `${prompt.user}\n\n${imageContent}`,
      },
      supabase
    );

    const validated = rosterImportSchema.parse(result.parsed);

    // Get existing players to avoid duplicates
    const { data: existingPlayers } = await supabase
      .from('players')
      .select('name')
      .eq('team_id', teamId);

    const existingNames = new Set(
      (existingPlayers || []).map((p: any) => p.name.toLowerCase())
    );

    const newPlayers = validated.players.filter(
      (p) => !existingNames.has(p.name.toLowerCase())
    );
    const duplicates = validated.players.filter(
      (p) => existingNames.has(p.name.toLowerCase())
    );

    // Get team info for age_group default
    const { data: team } = await supabase
      .from('teams')
      .select('age_group')
      .eq('id', teamId)
      .single();

    // Insert new players
    let inserted: any[] = [];
    if (newPlayers.length > 0) {
      const { data } = await supabase
        .from('players')
        .insert(
          newPlayers.map((p) => ({
            team_id: teamId,
            name: p.name,
            jersey_number: p.jersey_number ?? null,
            position: p.position || 'Flex',
            age_group: team?.age_group || '8-10',
          }))
        )
        .select();
      inserted = data || [];
    }

    return NextResponse.json({
      imported: inserted,
      duplicates: duplicates.map((p) => p.name),
      total_extracted: validated.players.length,
      interactionId: result.interactionId,
    });
  } catch (error: any) {
    console.error('Roster import error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
