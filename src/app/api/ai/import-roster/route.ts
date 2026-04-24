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

    // Parse the JSON response — be very strict about what constitutes a player name
    let parsed: RosterImport;
    try {
      let jsonText = extractedText.trim();
      // Strip markdown code fences
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonText = jsonMatch[1].trim();
      // Find the outermost JSON object
      const objMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objMatch) jsonText = objMatch[0];

      const raw = JSON.parse(jsonText);

      // Handle various response shapes
      let playerArray: any[] = [];
      if (raw.players && Array.isArray(raw.players)) {
        playerArray = raw.players;
      } else if (Array.isArray(raw)) {
        playerArray = raw;
      }

      // Validate each player — must have a real name (not JSON fragments)
      const validPlayers = playerArray
        .filter((p: any) => {
          if (!p || typeof p !== 'object') return false;
          const name = p.name || p.player_name || p.full_name;
          if (!name || typeof name !== 'string') return false;
          // Reject JSON-looking names
          if (name.includes('"') || name.includes(':') || name.includes('{') || name.includes('[')) return false;
          // Reject very short or very long names
          if (name.trim().length < 2 || name.trim().length > 60) return false;
          // Reject names that look like field names
          if (/^(confidence|jersey_number|position|name|players|null|true|false)$/i.test(name.trim())) return false;
          return true;
        })
        .map((p: any) => ({
          name: (p.name || p.player_name || p.full_name).trim(),
          jersey_number: typeof p.jersey_number === 'number' ? p.jersey_number : null,
          position: typeof p.position === 'string' && p.position.length < 20 ? p.position : 'Flex',
        }));

      if (validPlayers.length === 0) {
        return NextResponse.json({
          error: 'AI could not identify player names in this image. Try a clearer screenshot showing a list of names.',
        }, { status: 400 });
      }

      parsed = { players: validPlayers };
    } catch (parseErr) {
      console.error('Roster JSON parse failed:', parseErr, 'Raw:', extractedText.slice(0, 500));
      return NextResponse.json({
        error: 'Could not extract player data from the image. Try a clearer screenshot with visible player names.',
      }, { status: 400 });
    }

    // Check for duplicates against existing roster
    const { data: existingPlayers } = await admin
      .from('players')
      .select('name')
      .eq('team_id', teamId);

    const existingNames = new Set(
      (existingPlayers || []).map((p: any) => p.name.toLowerCase().trim())
    );

    const body2 = await request.clone().json().catch(() => ({}));
    const autoImport = body2.autoImport !== false; // default: auto-import

    const newPlayers = parsed.players.filter(
      (p) => !existingNames.has(p.name.toLowerCase().trim())
    );
    const duplicates = parsed.players.filter(
      (p) => existingNames.has(p.name.toLowerCase().trim())
    );

    // If autoImport is false, just return the extracted data for preview
    if (!autoImport) {
      return NextResponse.json({
        extracted: parsed.players,
        newPlayers,
        duplicates: duplicates.map((p) => p.name),
        total_extracted: parsed.players.length,
      });
    }

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
