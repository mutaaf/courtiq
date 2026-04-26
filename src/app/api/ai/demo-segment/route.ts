import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { headers } from 'next/headers';
import { segmentedObservationSchema } from '@/lib/ai/schemas';

// ─── In-memory IP rate limiter ────────────────────────────────────────────────
// 5 demo calls per IP per 15 minutes — prevents abuse without DB overhead.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Default demo roster ──────────────────────────────────────────────────────
const DEFAULT_ROSTER = [
  { name: 'Marcus', nickname: null as string | null, position: 'Guard', jersey_number: 12 },
  { name: 'Jayden', nickname: 'Jay', position: 'Forward', jersey_number: 7 },
  { name: 'Sofia',  nickname: null, position: 'Guard',   jersey_number: 23 },
  { name: 'Alex',   nickname: null, position: 'Center',  jersey_number: 5 },
  { name: 'Mia',    nickname: null, position: 'Forward', jersey_number: 15 },
];

export async function POST(request: Request) {
  // Resolve client IP
  const hdrs = await headers();
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Demo rate limit reached. Sign up for unlimited AI observations.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch {}

  const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 2000) : '';
  if (!transcript.trim()) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 });
  }

  const roster = Array.isArray(body.demoRoster) ? body.demoRoster : DEFAULT_ROSTER;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key configured — caller should fall back to mock data
    return NextResponse.json({ error: 'AI not configured', fallback: true }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });

  const rosterText = roster
    .map((p: any) =>
      `- ${p.name}${p.nickname ? ` ("${p.nickname}")` : ''} #${p.jersey_number ?? '?'} ${p.position}`
    )
    .join('\n');

  const systemPrompt = [
    'You segment coaching voice transcripts into individual player observations for youth sports.',
    '',
    'IMPORTANT: Be aggressive about phonetic name matching — match words that SOUND like a player name.',
    'Examples: "I mean" → Amin, "Jay" → Jayden, "mark us" → Marcus.',
    '',
    'Rules:',
    '- One observation per player per topic',
    '- Categories: Offense, Defense, IQ, Effort, Coachability, Teamwork, Dribbling, Shooting, Passing',
    '- Sentiment: positive | needs-work | neutral',
    '- Extract stats if mentioned (points, rebounds, assists, steals, blocks, turnovers)',
    '- Note tendencies when described',
    '- Even a short transcript should produce at least one observation',
    '',
    'Respond with valid JSON ONLY. No markdown, no explanation.',
  ].join('\n');

  const userPrompt = [
    'Roster:',
    rosterText,
    '',
    'Transcript:',
    transcript,
    '',
    'Return JSON:',
    '{"observations":[{"player_name":"","category":"","sentiment":"positive","text":"","stats":null,"tendency":null}],"unmatched_names":[],"team_observations":[]}',
  ].join('\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Strip possible markdown code fences
    let jsonText = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', fallback: true }, { status: 200 });
    }

    try {
      const validated = segmentedObservationSchema.parse(parsed);
      return NextResponse.json({
        observations: validated.observations,
        unmatched_names: validated.unmatched_names ?? [],
        team_observations: validated.team_observations ?? [],
        fromAI: true,
      });
    } catch {
      const raw = parsed as any;
      return NextResponse.json({
        observations: raw?.observations ?? [],
        unmatched_names: raw?.unmatched_names ?? [],
        team_observations: raw?.team_observations ?? [],
        fromAI: true,
      });
    }
  } catch {
    return NextResponse.json({ error: 'AI call failed', fallback: true }, { status: 200 });
  }
}
