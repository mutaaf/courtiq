import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { canAccess, type Tier } from '@/lib/tier';

// ─── GET /api/marketplace — browse all publicly published curricula ───────────
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Fetch all public curricula with sport info and skill count
  const { data: curricula, error } = await admin
    .from('curricula')
    .select(`
      id, name, description, publisher_name, import_count, org_id, created_at,
      sports ( id, name, slug, icon )
    `)
    .eq('is_public', true)
    .order('import_count', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch skill counts per curriculum in one query
  const curriculumIds = (curricula ?? []).map((c: any) => c.id);
  const skillCounts: Record<string, number> = {};
  if (curriculumIds.length > 0) {
    const { data: counts } = await admin
      .from('curriculum_skills')
      .select('curriculum_id')
      .in('curriculum_id', curriculumIds);

    if (counts) {
      for (const row of counts) {
        skillCounts[row.curriculum_id] = (skillCounts[row.curriculum_id] ?? 0) + 1;
      }
    }
  }

  // Get calling coach's org so we can flag their own curricula
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  const enriched = (curricula ?? []).map((c: any) => ({
    ...c,
    skill_count: skillCounts[c.id] ?? 0,
    is_own: c.org_id === coach?.org_id,
  }));

  return NextResponse.json({ curricula: enriched });
}

// ─── POST /api/marketplace — publish/unpublish or import a curriculum ─────────
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Resolve coach + org tier
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { data: org } = await admin
    .from('organizations')
    .select('tier, name')
    .eq('id', coach.org_id)
    .single();

  const orgTier = ((org as any)?.tier ?? 'free') as Tier;
  const body = await request.json();
  const { action } = body;

  // ── action: publish — toggle is_public on a curriculum you own ─────────────
  if (action === 'publish') {
    if (!canAccess(orgTier, 'curriculum_publish')) {
      return NextResponse.json(
        { error: 'Publishing requires a Pro Coach or Organization plan.', upgrade: true },
        { status: 403 }
      );
    }

    const { curriculum_id, publisher_name } = body;
    if (!curriculum_id) {
      return NextResponse.json({ error: 'curriculum_id required' }, { status: 400 });
    }

    // Verify this curriculum belongs to the coach's org
    const { data: curr } = await admin
      .from('curricula')
      .select('id, org_id, is_public')
      .eq('id', curriculum_id)
      .single();

    if (!curr) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });
    if (curr.org_id !== coach.org_id) {
      return NextResponse.json({ error: 'You can only publish your own curricula' }, { status: 403 });
    }

    const nowPublic = !curr.is_public;
    const { data: updated, error: updateError } = await admin
      .from('curricula')
      .update({
        is_public: nowPublic,
        publisher_name: nowPublic ? (publisher_name?.trim() || (org as any)?.name || 'Unknown') : null,
      })
      .eq('id', curriculum_id)
      .select('id, is_public, publisher_name')
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ curriculum: updated });
  }

  // ── action: import — copy a public curriculum into the coach's org ──────────
  if (action === 'import') {
    // All tiers coach+ can import (free included for now so they can try curricula)
    const { curriculum_id, team_id } = body;
    if (!curriculum_id) {
      return NextResponse.json({ error: 'curriculum_id required' }, { status: 400 });
    }

    // Fetch source curriculum
    const { data: source } = await admin
      .from('curricula')
      .select('*')
      .eq('id', curriculum_id)
      .eq('is_public', true)
      .single();

    if (!source) {
      return NextResponse.json({ error: 'Curriculum not found or not public' }, { status: 404 });
    }

    // Create a copy under the coach's org
    const { data: newCurr, error: insertError } = await admin
      .from('curricula')
      .insert({
        sport_id: source.sport_id,
        org_id: coach.org_id,
        name: `${source.name} (imported)`,
        description: source.description,
        is_default: false,
        is_public: false,
        publisher_name: null,
        import_count: 0,
        config: source.config,
      })
      .select('id')
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // Copy all skills
    const { data: sourceSkills } = await admin
      .from('curriculum_skills')
      .select('*')
      .eq('curriculum_id', curriculum_id)
      .order('sort_order', { ascending: true });

    if (sourceSkills && sourceSkills.length > 0) {
      const skillCopies = sourceSkills.map(({ id: _id, curriculum_id: _cid, ...rest }: any) => ({
        ...rest,
        curriculum_id: newCurr.id,
      }));
      const { error: skillsError } = await admin.from('curriculum_skills').insert(skillCopies);
      if (skillsError) return NextResponse.json({ error: skillsError.message }, { status: 500 });
    }

    // Increment import_count on the source (fire-and-forget style — don't fail on error)
    await admin
      .from('curricula')
      .update({ import_count: (source.import_count ?? 0) + 1 })
      .eq('id', curriculum_id);

    // If team_id provided, assign the new curriculum to that team
    if (team_id) {
      // Verify team belongs to coach's org
      const { data: team } = await admin
        .from('teams')
        .select('id, org_id')
        .eq('id', team_id)
        .single();

      if (team && team.org_id === coach.org_id) {
        await admin.from('teams').update({ curriculum_id: newCurr.id }).eq('id', team_id);
      }
    }

    return NextResponse.json({ curriculum_id: newCurr.id, message: 'Curriculum imported successfully' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
