import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { parseFavoritedDrills, toggleFavorite } from '@/lib/drill-favorites-utils';

/**
 * GET /api/drill-favorites
 * Returns the current coach's list of favorited drill IDs.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const { data: coach } = await admin
    .from('coaches')
    .select('preferences')
    .eq('id', user.id)
    .single();

  const favorites = parseFavoritedDrills(coach?.preferences);
  return NextResponse.json({ favorites });
}

/**
 * PATCH /api/drill-favorites
 * Body: { drill_id: string }
 * Toggles the drill in/out of the coach's favorites.
 * Returns the updated favorites list and whether the drill is now favorited.
 */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { drill_id } = body;
  if (!drill_id || typeof drill_id !== 'string') {
    return NextResponse.json({ error: 'drill_id is required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Read current preferences
  const { data: coach } = await admin
    .from('coaches')
    .select('preferences')
    .eq('id', user.id)
    .single();

  const currentPrefs = (coach?.preferences as Record<string, unknown>) ?? {};
  const currentFavorites = parseFavoritedDrills(currentPrefs);
  const updatedFavorites = toggleFavorite(drill_id, currentFavorites);
  const isFavorited = updatedFavorites.includes(drill_id);

  const { error } = await admin
    .from('coaches')
    .update({ preferences: { ...currentPrefs, favorited_drills: updatedFavorites } })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update favorites' }, { status: 500 });
  }

  return NextResponse.json({ favorites: updatedFavorites, favorited: isFavorited });
}
