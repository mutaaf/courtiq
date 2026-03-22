import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

async function getShareData(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/share/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getShareData(token);

  if (!data || data.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-zinc-100">Report not found</h2>
            <p className="mt-2 text-sm text-zinc-400">This share link may have expired or been revoked.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-2xl">🏀</div>
          <h1 className="text-2xl font-bold text-zinc-100">{data.player?.name || 'Player'}</h1>
          <p className="text-sm text-zinc-400">{data.team?.name || 'Team'} &middot; {data.player?.age_group}</p>
        </div>

        {data.proficiency && data.proficiency.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Skill Progress</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.proficiency.map((skill: any) => (
                <div key={skill.skill_id}>
                  <div className="flex justify-between text-sm">
                    <span>{skill.skill_name || skill.skill_id}</span>
                    <Badge variant={skill.proficiency_level === 'got_it' ? 'success' : skill.proficiency_level === 'practicing' ? 'default' : 'secondary'}>
                      {skill.proficiency_level}
                    </Badge>
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

        {data.coach_note && (
          <Card>
            <CardHeader><CardTitle className="text-base">Coach&apos;s Note</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-300">{data.coach_note}</p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-zinc-600">Powered by CourtIQ</p>
      </div>
    </div>
  );
}
