import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';

interface RegisterRequest {
  companyName: string;
  slug: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();

  try {
    const body: RegisterRequest = await request.json();
    const { companyName, slug, firstName, lastName, username, email, password } = body;

    // Validate required fields
    if (!companyName || !slug || !firstName || !lastName || !username || !email || !password) {
      return NextResponse.json(
        { error: 'Alle Felder sind erforderlich' },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 3) {
      return NextResponse.json(
        { error: 'Firmenkennung muss mindestens 3 Zeichen lang sein und darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' },
        { status: 400 }
      );
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Ungültige E-Mail-Adresse' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Passwort muss mindestens 12 Zeichen lang sein' },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const { data: existingOrg } = await (supabase as any)
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingOrg) {
      return NextResponse.json(
        { error: 'Diese Firmenkennung ist bereits vergeben' },
        { status: 409 }
      );
    }

    // Check username uniqueness
    const { data: existingUsername } = await (supabase as any)
      .from('auth_credentials')
      .select('id')
      .eq('username', username.toLowerCase())
      .maybeSingle();

    if (existingUsername) {
      return NextResponse.json(
        { error: 'Dieser Benutzername ist bereits vergeben' },
        { status: 409 }
      );
    }

    // Check email uniqueness
    const { data: existingEmail } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Diese E-Mail-Adresse wird bereits verwendet' },
        { status: 409 }
      );
    }

    // Create a temporary org ID for the profile trigger
    // We'll use create_organization() RPC to do everything atomically

    // 1. Create auth user in Supabase
    // Note: organization_id will be set to default by trigger, then updated by create_organization()
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        username: username.toLowerCase(),
        // Use default org initially; create_organization() will update it
        organization_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      },
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      return NextResponse.json(
        { error: `Fehler beim Erstellen des Benutzers: ${authError.message}` },
        { status: 500 }
      );
    }

    // 2. Update profile with name (trigger may have created it)
    await (supabase as any)
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        role: 'admin',
      })
      .eq('id', authUser.user.id);

    // 3. Create auth_credentials with the password hash
    const passwordHash = await hashPassword(password);
    await (supabase as any)
      .from('auth_credentials')
      .insert({
        user_id: authUser.user.id,
        username: username.toLowerCase(),
        password_hash: passwordHash,
        must_change_password: false,
        organization_id: 'aaaaaaaa-0000-0000-0000-000000000001', // temporary, updated by RPC
      });

    // 4. Call create_organization() RPC to atomically create org and update user
    const { data: orgId, error: orgError } = await (supabase as any)
      .rpc('create_organization', {
        p_org_name: companyName,
        p_slug: slug,
        p_contact_email: email.toLowerCase(),
        p_user_id: authUser.user.id,
      });

    if (orgError) {
      // Rollback: delete auth user
      await supabase.auth.admin.deleteUser(authUser.user.id);
      console.error('Organization creation error:', orgError);
      return NextResponse.json(
        { error: `Fehler beim Erstellen der Organisation: ${orgError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: orgId,
      message: 'Organisation und Benutzerkonto wurden erfolgreich erstellt.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Ein unerwarteter Fehler ist aufgetreten' },
      { status: 500 }
    );
  }
}
