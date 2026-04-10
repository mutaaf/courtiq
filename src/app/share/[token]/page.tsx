import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

async function getShareData(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/share/${token}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Not found', status: res.status, pinRequired: err.pinRequired };
    }
    return res.json();
  } catch {
    return null;
  }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getShareData(token);

  if (!data || data.error) {
    const isExpired = data?.status === 410;
    const needsPin = data?.pinRequired;

    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-zinc-100">
              {isExpired ? 'Link Expired' : needsPin ? 'PIN Required' : 'Report not found'}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {isExpired
                ? 'This share link has expired. Please ask the coach for a new link.'
                : needsPin
                ? 'This report requires a PIN to access. Please contact the coach.'
                : 'This share link may have expired or been revoked.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { player, team, coachName, branding, customMessage, reportCard, developmentCard, highlights, skillProgress, recommendedDrills } = data;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg space-y-6 py-6">
        {/* Header */}
        <div className="text-center">
          {player?.photo_url ? (
            <img
              src={player.photo_url}
              alt={player.name}
              className="mx-auto mb-4 h-20 w-20 rounded-full object-cover ring-2 ring-zinc-700"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/20 text-2xl font-bold text-orange-400">
              {player?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </div>
          )}
          <h1 className="text-2xl font-bold text-zinc-100">{player?.name || 'Player'}</h1>
          <p className="text-sm text-zinc-400">
            {team?.name || 'Team'}
            {player?.position && <> &middot; {player.position}</>}
            {player?.jersey_number !== null && player?.jersey_number !== undefined && <> &middot; #{player.jersey_number}</>}
          </p>
          {coachName && (
            <p className="mt-1 text-xs text-zinc-500">Coach: {coachName}</p>
          )}
        </div>

        {/* Custom Message */}
        {customMessage && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-300 italic">{customMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Report Card */}
        {reportCard && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Report Card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reportCard.summary && (
                <p className="text-sm text-zinc-300">{reportCard.summary}</p>
              )}
              {reportCard.strengths && reportCard.strengths.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">Strengths</h4>
                  <ul className="space-y-1">
                    {reportCard.strengths.map((s: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        {typeof s === 'string' ? s : s.skill || s.description || s.name || String(s)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reportCard.areas_for_improvement && reportCard.areas_for_improvement.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-orange-400 mb-1.5">Areas for Growth</h4>
                  <ul className="space-y-1">
                    {reportCard.areas_for_improvement.map((a: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="text-orange-500 mt-0.5 shrink-0">*</span>
                        {typeof a === 'string' ? a : a.skill || a.description || a.name || String(a)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reportCard.grades && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Grades</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(Array.isArray(reportCard.grades)
                      ? reportCard.grades
                      : Object.entries(reportCard.grades).map(([k, v]) => ({ skill: k, grade: v }))
                    ).map((g: any, i: number) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                        <span className="text-sm text-zinc-300">{g.skill || g.category}</span>
                        <Badge variant="secondary">{g.grade || g.level || g.score}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {reportCard.coach_message && (
                <p className="text-sm text-zinc-300 italic border-l-2 border-orange-500/30 pl-3">
                  {reportCard.coach_message}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Development Card */}
        {developmentCard && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Development Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {developmentCard.summary && (
                <p className="text-sm text-zinc-300">{developmentCard.summary}</p>
              )}
              {developmentCard.focus_areas && Array.isArray(developmentCard.focus_areas) && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1.5">Focus Areas</h4>
                  <ul className="space-y-1">
                    {developmentCard.focus_areas.map((area: any, i: number) => (
                      <li key={i} className="text-sm text-zinc-300">
                        - {typeof area === 'string' ? area : area.name || area.skill || String(area)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {developmentCard.goals && Array.isArray(developmentCard.goals) && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-400 mb-1.5">Goals</h4>
                  <ul className="space-y-1">
                    {developmentCard.goals.map((goal: any, i: number) => (
                      <li key={i} className="text-sm text-zinc-300">
                        - {typeof goal === 'string' ? goal : goal.description || goal.text || String(goal)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Skill Progress */}
        {skillProgress && skillProgress.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skill Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {skillProgress.map((skill: any) => (
                <div key={skill.skill_id}>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">{skill.skill_name || skill.skill_id}</span>
                    <div className="flex items-center gap-2">
                      {skill.trend && (
                        <span className={`text-xs ${skill.trend === 'improving' ? 'text-emerald-400' : skill.trend === 'declining' ? 'text-red-400' : 'text-zinc-500'}`}>
                          {skill.trend === 'improving' ? 'Improving' : skill.trend === 'declining' ? 'Declining' : 'Steady'}
                        </span>
                      )}
                      <Badge variant={skill.proficiency_level === 'got_it' ? 'success' : skill.proficiency_level === 'practicing' ? 'default' : 'secondary'}>
                        {skill.proficiency_level?.replace(/_/g, ' ') || 'N/A'}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-zinc-800">
                    <div
                      className="h-2 rounded-full bg-orange-500 transition-all"
                      style={{ width: `${(skill.success_rate || 0) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Highlights */}
        {highlights && highlights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Highlights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {highlights.map((obs: any, i: number) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px]">{obs.category}</Badge>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(obs.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">{obs.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recommended Drills */}
        {recommendedDrills && recommendedDrills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommended Practice at Home</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recommendedDrills.map((drill: any, i: number) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                  <p className="text-sm font-medium text-zinc-200">
                    {typeof drill === 'string' ? drill : drill.name || drill.title || String(drill)}
                  </p>
                  {drill.description && (
                    <p className="mt-1 text-xs text-zinc-400">{drill.description}</p>
                  )}
                  {drill.duration && (
                    <span className="text-xs text-zinc-500">{drill.duration}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-zinc-600">Powered by SportsIQ</p>
      </div>
    </div>
  );
}
