import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/home';

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Use service role to bypass RLS for initial setup
      const adminSupabase = await createServiceSupabase();

      // Check if coach record exists
      const { data: coach } = await adminSupabase
        .from('coaches')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!coach) {
        const name = data.user.user_metadata.full_name || data.user.email?.split('@')[0] || 'Coach';

        // Invited coaches have org_id set in user_metadata by the admin invite API
        const inviteOrgId = data.user.user_metadata?.org_id as string | undefined;
        const initialRole = (data.user.user_metadata?.initial_role as string | undefined) || 'coach';

        if (inviteOrgId) {
          // Join the inviting organization instead of creating a new one
          await adminSupabase.from('coaches').insert({
            id: data.user.id,
            org_id: inviteOrgId,
            full_name: name,
            email: data.user.email!,
            role: initialRole,
          });
          return NextResponse.redirect(`${origin}/home`);
        }

        // New self-signup — create their own organization
        const { data: org, error: orgError } = await adminSupabase
          .from('organizations')
          .insert({
            name: `${name}'s Organization`,
            slug: name.toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36),
          })
          .select()
          .single();

        if (org && !orgError) {
          await adminSupabase.from('coaches').insert({
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
