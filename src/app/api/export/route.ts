import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const headerRow = headers.map(escapeCsvField).join(',');
  const dataRows = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerRow, ...dataRows].join('\r\n');
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'observations';
  const teamId = url.searchParams.get('team_id');

  if (!teamId) {
    return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  let csv = '';
  let filename = '';
  const dateStamp = new Date().toISOString().slice(0, 10);

  try {
    if (type === 'observations') {
      const [obsResult, playersResult, sessionsResult] = await Promise.all([
        admin
          .from('observations')
          .select('player_id, session_id, category, sentiment, text, source, ai_parsed, created_at')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false }),
        admin.from('players').select('id, name').eq('team_id', teamId),
        admin.from('sessions').select('id, date, type').eq('team_id', teamId),
      ]);

      const observations = obsResult.data || [];
      const playerMap = new Map((playersResult.data || []).map((p) => [p.id, p.name]));
      const sessionMap = new Map(
        (sessionsResult.data || []).map((s) => [s.id, `${s.date} (${s.type})`])
      );

      const headers = ['Date', 'Session', 'Player', 'Category', 'Sentiment', 'Notes', 'Source', 'AI Parsed'];
      const rows = observations.map((o) => [
        new Date(o.created_at).toLocaleDateString('en-US'),
        o.session_id ? (sessionMap.get(o.session_id) ?? '') : '',
        o.player_id ? (playerMap.get(o.player_id) ?? 'Unknown') : 'Team',
        o.category ?? '',
        o.sentiment ?? '',
        o.text ?? '',
        o.source ?? '',
        o.ai_parsed ? 'Yes' : 'No',
      ]);

      csv = buildCsv(headers, rows);
      filename = `observations-${dateStamp}.csv`;
    } else if (type === 'roster') {
      const [playersResult, obsResult] = await Promise.all([
        admin.from('players').select('id, name, jersey_number, position, age_group, is_active').eq('team_id', teamId).order('name', { ascending: true }),
        admin.from('observations').select('player_id, sentiment').eq('team_id', teamId),
      ]);

      const players = playersResult.data || [];
      const observations = obsResult.data || [];

      const playerStats = new Map<string, { total: number; positive: number; needsWork: number; neutral: number }>();
      players.forEach((p) => playerStats.set(p.id, { total: 0, positive: 0, needsWork: 0, neutral: 0 }));
      observations.forEach((o) => {
        if (!o.player_id) return;
        const s = playerStats.get(o.player_id);
        if (!s) return;
        s.total++;
        if (o.sentiment === 'positive') s.positive++;
        else if (o.sentiment === 'needs-work') s.needsWork++;
        else s.neutral++;
      });

      const headers = ['Name', 'Jersey #', 'Position', 'Age Group', 'Active', 'Total Observations', 'Positive', 'Needs Work', 'Neutral', 'Health Score %'];
      const rows = players.map((p) => {
        const stats = playerStats.get(p.id) ?? { total: 0, positive: 0, needsWork: 0, neutral: 0 };
        const scored = stats.positive + stats.needsWork;
        const healthScore = scored > 0 ? Math.round((stats.positive / scored) * 100) : '';
        return [
          p.name,
          p.jersey_number ?? '',
          p.position ?? '',
          p.age_group ?? '',
          p.is_active ? 'Yes' : 'No',
          stats.total,
          stats.positive,
          stats.needsWork,
          stats.neutral,
          healthScore,
        ];
      });

      csv = buildCsv(headers, rows);
      filename = `roster-${dateStamp}.csv`;
    } else if (type === 'sessions') {
      const [sessionsResult, obsResult] = await Promise.all([
        admin
          .from('sessions')
          .select('id, date, type, location, opponent, result, notes')
          .eq('team_id', teamId)
          .order('date', { ascending: false }),
        admin.from('observations').select('session_id, sentiment').eq('team_id', teamId),
      ]);

      const sessions = sessionsResult.data || [];
      const observations = obsResult.data || [];

      const sessionStats = new Map<string, { total: number; positive: number; needsWork: number }>();
      sessions.forEach((s) => sessionStats.set(s.id, { total: 0, positive: 0, needsWork: 0 }));
      observations.forEach((o) => {
        if (!o.session_id) return;
        const s = sessionStats.get(o.session_id);
        if (!s) return;
        s.total++;
        if (o.sentiment === 'positive') s.positive++;
        else if (o.sentiment === 'needs-work') s.needsWork++;
      });

      const headers = ['Date', 'Type', 'Location', 'Opponent', 'Result', 'Total Observations', 'Health Score %', 'Notes'];
      const rows = sessions.map((s) => {
        const stats = sessionStats.get(s.id) ?? { total: 0, positive: 0, needsWork: 0 };
        const scored = stats.positive + stats.needsWork;
        const healthScore = scored > 0 ? Math.round((stats.positive / scored) * 100) : '';
        return [
          s.date,
          s.type,
          s.location ?? '',
          s.opponent ?? '',
          s.result ?? '',
          stats.total,
          healthScore,
          s.notes ?? '',
        ];
      });

      csv = buildCsv(headers, rows);
      filename = `sessions-${dateStamp}.csv`;
    } else {
      return NextResponse.json({ error: 'Invalid export type. Use: observations, roster, sessions' }, { status: 400 });
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
