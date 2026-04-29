import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { rosterImportSchema, type RosterImport } from '@/lib/ai/schemas';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { getConfiguredProvider } from '@/lib/ai/client';
import { enforceAIQuota } from '@/lib/ai/quota';
import { TierLimitError } from '@/lib/rate-limit';
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
    // Quota enforcement — vision API call counts against the monthly cap, same
    // as any other AI interaction. callAI doesn't run for this path because we
    // call providers directly with image bytes.
    try {
      await enforceAIQuota(admin, user.id);
    } catch (e) {
      if (e instanceof TierLimitError) {
        return NextResponse.json(
          { error: e.message, upgrade: true, tier: e.tier, limit: e.limit },
          { status: 402 },
        );
      }
      throw e;
    }

    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const { provider, apiKey } = await getConfiguredProvider(admin, coach?.org_id || '');
    const prompt = PROMPT_REGISTRY.importRoster();
    const fullPrompt = prompt.user + '\n\nRespond with JSON only: { "players": [{ "name": "...", "jersey_number": null, "position": "..." }] }';

    // Normalize mime type for vision APIs
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    type VisionMimeType = typeof validMimeTypes[number];
    const normalizedMime: VisionMimeType = validMimeTypes.includes(mimeType as VisionMimeType)
      ? (mimeType as VisionMimeType)
      : 'image/jpeg';

    let extractedText = '';
    const errors: string[] = [];

    // Try each provider — fall through on failure
    // Try Gemini first for vision (best at image extraction, cheapest)
    const geminiKey = (body as any).geminiKey || ((await admin.from('organizations').select('settings').eq('id', coach?.org_id).single()).data?.settings as any)?.ai_keys?.gemini;

    if (!extractedText && geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([
          { inlineData: { mimeType: normalizedMime, data: imageBase64 } },
          fullPrompt,
        ]);
        extractedText = result.response.text();
      } catch (e: any) {
        errors.push(`Gemini: ${e.message}`);
      }
    }

    // Fallback to configured provider
    if (!extractedText) {
      try {
        if (provider === 'anthropic') {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: normalizedMime, data: imageBase64 } },
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
                { type: 'image_url', image_url: { url: `data:${normalizedMime};base64,${imageBase64}` } },
                { type: 'text', text: fullPrompt },
              ],
            }],
          });
          extractedText = response.choices[0]?.message?.content || '';
        } else if (provider === 'gemini') {
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const result = await model.generateContent([
            { inlineData: { mimeType: normalizedMime, data: imageBase64 } },
            fullPrompt,
          ]);
          extractedText = result.response.text();
        }
      } catch (e: any) {
        errors.push(`${provider}: ${e.message}`);
      }
    }

    if (!extractedText) {
      return NextResponse.json({
        error: `AI could not process the image. ${errors.join('; ')}`,
      }, { status: 500 });
    }

    // Parse the AI response to extract player names
    console.log('Roster import raw AI response:', extractedText.slice(0, 1000));

    let parsed: RosterImport = { players: [] };

    // Strategy 1: Try to parse as JSON
    let jsonParsed = false;
    try {
      let jsonText = extractedText.trim();
      // Strip markdown code fences
      const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonText = fenceMatch[1].trim();
      // Find JSON object or array
      const objMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objMatch) jsonText = objMatch[0];

      const raw = JSON.parse(jsonText);

      // Extract player array from various shapes
      let playerArray: any[] = [];
      if (raw.players && Array.isArray(raw.players)) {
        playerArray = raw.players;
      } else if (Array.isArray(raw)) {
        playerArray = raw;
      } else if (raw.name && typeof raw.name === 'string') {
        playerArray = [raw]; // single player object
      }

      if (playerArray.length > 0) {
        const validPlayers = playerArray
          .map((p: any) => {
            const name = (p.name || p.player_name || p.full_name || '').toString().trim();
            return {
              name,
              jersey_number: typeof p.jersey_number === 'number' ? p.jersey_number : null,
              position: typeof p.position === 'string' && p.position.length < 20 ? p.position : 'Flex',
            };
          })
          .filter((p) => {
            // Must be a real human name
            if (p.name.length < 2 || p.name.length > 60) return false;
            // Reject JSON field names or fragments
            if (/^(confidence|jersey_number|position|name|players|null|true|false|high|medium|low)$/i.test(p.name)) return false;
            if (/[{}[\]"]/.test(p.name)) return false;
            return true;
          });

        if (validPlayers.length > 0) {
          parsed = { players: validPlayers };
          jsonParsed = true;
        }
      }
    } catch {
      // JSON parse failed — will try text extraction below
    }

    // Strategy 2: If JSON failed, extract names from plain text
    if (!jsonParsed!) {
      // Look for lines that look like human names (First Last pattern)
      const namePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/;
      const lines = extractedText.split('\n')
        .map(l => l.replace(/^[-•*\d.)\s]+/, '').replace(/[",{}[\]]/g, '').trim())
        .filter(l => {
          if (l.length < 3 || l.length > 60) return false;
          // Must look like a name (capitalized words)
          if (namePattern.test(l)) return true;
          // Also accept "First Last" even with different casing
          const words = l.split(/\s+/);
          return words.length >= 2 && words.every(w => /^[a-zA-Z'-]+$/.test(w));
        });

      if (lines.length > 0) {
        parsed = {
          players: lines.map(name => ({ name, jersey_number: null, position: 'Flex' })),
        };
      } else {
        return NextResponse.json({
          error: 'Could not extract player names from the image. Try a clearer screenshot showing a list of names.',
          debug: extractedText.slice(0, 300),
        }, { status: 400 });
      }
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
