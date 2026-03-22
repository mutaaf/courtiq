import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/home';

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if coach record exists
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!coach) {
        // Create org + coach for new OAuth user
        const name = data.user.user_metadata.full_name || data.user.email?.split('@')[0] || 'Coach';
        const { data: org } = await supabase
          .from('organizations')
          .insert({
            name: `${name}'s Organization`,
            slug: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36),
          })
          .select()
          .single();

        if (org) {
          await supabase.from('coaches').insert({
            id: data.user.id,
            org_id: org.id,
            full_name: name,
            email: data.user.email!,
            role: 'admin',
            avatar_url: data.user.user_metadata.avatar_url,
          });
        }

        return NextResponse.redirect(`${origin}/onboarding/sport`);
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
