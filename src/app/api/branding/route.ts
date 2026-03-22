import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: coach } = await supabase
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    const { data: branding } = await supabase
      .from('org_branding')
      .select('*')
      .eq('org_id', coach.org_id)
      .single();

    // Return defaults if no branding exists
    if (!branding) {
      return NextResponse.json({
        branding: {
          org_id: coach.org_id,
          primary_color: '#2563eb',
          secondary_color: '#1e40af',
          accent_color: null,
          font_family: null,
          logo_light_url: null,
          logo_dark_url: null,
          favicon_url: null,
          custom_css: null,
          parent_portal_header_text: null,
          parent_portal_footer_text: null,
          email_sender_name: null,
          email_footer_html: null,
          custom_domain: null,
        },
      });
    }

    return NextResponse.json({ branding });
  } catch (error: any) {
    console.error('Branding GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  try {
    const { data: coach } = await supabase
      .from('coaches')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    if (coach.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update branding' }, { status: 403 });
    }

    // Only allow certain fields to be updated
    const allowedFields = [
      'primary_color', 'secondary_color', 'accent_color', 'font_family',
      'logo_light_url', 'logo_dark_url', 'favicon_url', 'custom_css',
      'parent_portal_header_text', 'parent_portal_footer_text',
      'email_sender_name', 'email_footer_html', 'custom_domain',
    ];

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Upsert branding
    const { data: branding, error } = await supabase
      .from('org_branding')
      .upsert(
        { org_id: coach.org_id, ...updates },
        { onConflict: 'org_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ branding });
  } catch (error: any) {
    console.error('Branding PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
