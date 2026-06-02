import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { UnfollowMeButton } from '@/components/coach-profile/unfollow-me-button';

// Ticket 0063 — /coach-profile/followers
//
// The authed page listing the caller's full follower set. Each row shows the
// follower's FIRST name only (server-side parsed via `full_name.split(' ')[0]`)
// + a small Unfollow-me link that DELETEs the follow row (both parties can
// dissolve the edge from their own side).
//
// COPPA: the page reads coaches.full_name with a STRICT `.select('id,
// full_name')` allow-list and renders ONLY the first name. The follower's
// last name, email, phone, parent contact, or any other field is never
// surfaced. The page is auth-required by default (NOT in `publicPaths`).
//
// The page is NOT linked from the public coach profile (0026) — the follower
// count never leaks to a public surface.

export default async function FollowersPage() {
  const auth = await createServerSupabase();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/login?next=/coach-profile/followers');

  const admin = await createServiceSupabase();

  // 1) The full set of rows where I am the followee, newest first.
  const { data: followsRaw } = await admin
    .from('coach_follows')
    .select('id, follower_id, created_at')
    .eq('followee_id', user.id)
    .order('created_at', { ascending: false });
  const follows = (followsRaw ?? []) as Array<{
    id: string;
    follower_id: string;
    created_at: string;
  }>;

  // 2) Resolve the followers' first names via the COPPA-safe allow-list.
  const followerIds = Array.from(new Set(follows.map((f) => f.follower_id)));
  const { data: coachesRaw } =
    followerIds.length > 0
      ? await admin.from('coaches').select('id, full_name').in('id', followerIds)
      : { data: [] };
  const fullNameById = new Map<string, string>();
  for (const c of (coachesRaw ?? []) as Array<{ id: string; full_name: string | null }>) {
    fullNameById.set(c.id, c.full_name ?? '');
  }

  const rows = follows.map((f) => {
    const fullName = fullNameById.get(f.follower_id) ?? '';
    const firstName = String(fullName).split(' ')[0] || 'Coach';
    return {
      followId: f.id,
      followerId: f.follower_id,
      followerFirstName: firstName,
      createdAt: f.created_at,
    };
  });

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8" data-testid="followers-page">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Coaches following you</h1>
        <p className="text-sm text-zinc-400">
          These coaches see your published practice plans at the top of their league feed.
        </p>
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400"
          data-testid="followers-empty"
        >
          No followers yet. When another coach clones one of your plans and taps Follow, they
          show up here.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="followers-list">
          {rows.map((row) => (
            <li
              key={row.followId}
              data-testid="followers-row"
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100">
                  Coach <span className="font-semibold">{row.followerFirstName}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  Followed {new Date(row.createdAt).toLocaleDateString()}
                </p>
              </div>
              <UnfollowMeButton followerId={row.followerId} />
            </li>
          ))}
        </ul>
      )}

      <div>
        <Link
          href="/home"
          className="text-xs font-medium text-orange-400 hover:text-orange-300"
        >
          ← Back to /home
        </Link>
      </div>
    </div>
  );
}
