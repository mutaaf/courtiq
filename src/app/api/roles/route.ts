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

    const { data: roles } = await supabase
      .from('org_roles')
      .select('*')
      .eq('org_id', coach.org_id)
      .order('sort_order', { ascending: true });

    return NextResponse.json({ roles: roles || [] });
  } catch (error: any) {
    console.error('Roles GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { roleKey, name, description, permissions } = body;

  if (!roleKey || !name) {
    return NextResponse.json({ error: 'roleKey and name required' }, { status: 400 });
  }

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
      return NextResponse.json({ error: 'Only admins can create roles' }, { status: 403 });
    }

    // Check for duplicate role_key
    const { data: existing } = await supabase
      .from('org_roles')
      .select('id')
      .eq('org_id', coach.org_id)
      .eq('role_key', roleKey)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Role key already exists' }, { status: 409 });
    }

    // Get max sort_order
    const { data: maxRole } = await supabase
      .from('org_roles')
      .select('sort_order')
      .eq('org_id', coach.org_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const sortOrder = (maxRole?.sort_order || 0) + 1;

    const { data: role, error } = await supabase
      .from('org_roles')
      .insert({
        org_id: coach.org_id,
        role_key: roleKey,
        name,
        description: description || null,
        permissions: permissions || {},
        is_system: false,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ role }, { status: 201 });
  } catch (error: any) {
    console.error('Roles POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { roleId, name, description, permissions, sortOrder } = body;

  if (!roleId) {
    return NextResponse.json({ error: 'roleId required' }, { status: 400 });
  }

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
      return NextResponse.json({ error: 'Only admins can update roles' }, { status: 403 });
    }

    // Verify the role belongs to this org and is not a system role
    const { data: existing } = await supabase
      .from('org_roles')
      .select('id, is_system')
      .eq('id', roleId)
      .eq('org_id', coach.org_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    if (existing.is_system) {
      return NextResponse.json({ error: 'Cannot modify system roles' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (permissions !== undefined) updates.permissions = permissions;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: role, error } = await supabase
      .from('org_roles')
      .update(updates)
      .eq('id', roleId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ role });
  } catch (error: any) {
    console.error('Roles PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
