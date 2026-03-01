import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();

  // Verify super admin
  const { data: profile } = await (serviceClient as any)
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';

  let query = (serviceClient as any)
    .from('profiles')
    .select('id, email, first_name, last_name, role, is_active, organization_id, organizations:organization_id(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten org name
  const users = (data || []).map((u: any) => ({
    ...u,
    organization_name: u.organizations?.name || null,
    organizations: undefined,
  }));

  return NextResponse.json(users);
}
