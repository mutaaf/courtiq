import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { rosterImportSchema, type RosterImport } from '@/lib/ai/schemas';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { getConfiguredProvider } from '@/lib/ai/client';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const { teamId, imageBase64, mimeType = 'image/jpeg' } = body;

  if (!teamId || !imageBase64) {
    return NextResponse.json({ error: 'teamId and imageBase64 required' }, { status: 400 });
  }

  // Check image size — reject if base64 is > 4MB (roughly 3MB image)
  if (imageBase64.length > 4 * 1024 * 1024) {
    return NextResponse.json({
      error: 'Image is too large. Please use a smaller screenshot or photo.',
    }, { status: 413 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const { provider, apiKey } = await getConfiguredProvider(admin, coach?.org_id || '');
    const prompt = PROMPT_REGISTRY.importRoster();
    const fullPrompt = prompt.user + '\n\nRespond with JSON only: { "players": [{ "name": "...", "jersey_number": null, "position": "..." }] }';

    let extractedText = '';

    // Use vision API directly (not callAI which puts images in text)
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: fullPrompt },
          ],
        }],
      });
      extractedText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: fullPrompt },
          ],
        }],
      });
      extractedText = response.choices[0]?.message?.content || '';
    } else if (provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent([
        { inlineData: { mimeType, data: imageBase64 } },
        fullPrompt,
      ]);
      extractedText = result.response.text();
    }

    // Parse the JSON response
    let parsed: RosterImport;
    try {
      let jsonText = extractedText.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonText = jsonMatch[1].trim();
      // Try to find JSON object in the response
      const objMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objMatch) jsonText = objMatch[0];
      parsed = rosterImportSchema.parse(JSON.parse(jsonText));
    } catch {
      // Fallback: try to extract names line by line
      const lines = extractedText.split('\n').filter(l => l.trim().length > 2);
      const players = lines
        .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(l => l.length > 1 && l.length < 50 && !l.includes('{'))
        .map(name => ({ name, jersey_number: null, position: 'Flex' }));

      if (players.length === 0) {
        return NextResponse.json({ error: 'Could not extract player names from the image. Try a clearer screenshot.' }, { status: 400 });
      }
      parsed = { players };
    }

    // Deduplicate against existing roster
    const { data: existingPlayers } = await admin
      .from('players')
      .select('name')
      .eq('team_id', teamId);

    const existingNames = new Set(
      (existingPlayers || []).map((p: any) => p.name.toLowerCase().trim())
    );

    const newPlayers = parsed.players.filter(
      (p) => !existingNames.has(p.name.toLowerCase().trim())
    );
    const duplicates = parsed.players.filter(
      (p) => existingNames.has(p.name.toLowerCase().trim())
    );

    const { data: team } = await admin
      .from('teams')
      .select('age_group')
      .eq('id', teamId)
      .single();

    let inserted: any[] = [];
    if (newPlayers.length > 0) {
      const { data } = await admin
        .from('players')
        .insert(
          newPlayers.map((p) => ({
            team_id: teamId,
            name: p.name.trim(),
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
      total_extracted: parsed.players.length,
    });
  } catch (error: any) {
    console.error('Roster import error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process roster image' }, { status: 500 });
  }
}
