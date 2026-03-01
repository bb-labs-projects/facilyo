import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

async function verifySuperAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await (serviceClient as any)
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await verifySuperAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const url = new URL(request.url);

  // Single org detail
  const id = url.searchParams.get('id');
  if (id) {
    const { data: organization } = await (serviceClient as any)
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    const { data: members } = await (serviceClient as any)
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active')
      .eq('organization_id', id);

    return NextResponse.json({ organization, members });
  }

  // Stats mode
  if (url.searchParams.get('stats') === 'true') {
    const { count: orgCount } = await (serviceClient as any)
      .from('organizations')
      .select('*', { count: 'exact', head: true });

    const { count: userCount } = await (serviceClient as any)
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: activeOrgCount } = await (serviceClient as any)
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { data: recentOrgs } = await (serviceClient as any)
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({ orgCount, userCount, activeOrgCount, recentOrgs });
  }

  // List all
  const { data } = await (serviceClient as any)
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await verifySuperAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const body = await request.json();

  const { data, error } = await (serviceClient as any)
    .from('organizations')
    .insert({
      name: body.name,
      slug: body.slug,
      contact_email: body.contact_email,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const user = await verifySuperAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const body = await request.json();

  const { data, error } = await (serviceClient as any)
    .from('organizations')
    .update({ is_active: body.is_active })
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const user = await verifySuperAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const body = await request.json();

  // Check for members first
  const { count } = await (serviceClient as any)
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', body.id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Organisation hat noch Mitglieder. Bitte entfernen Sie zuerst alle Benutzer.' },
      { status: 400 }
    );
  }

  const { error } = await (serviceClient as any)
    .from('organizations')
    .delete()
    .eq('id', body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
