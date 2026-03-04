import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hashPassword, generateTempPassword, generateUniqueUsername } from '@/lib/auth/password';
import type { UserRole } from '@/types/database';

// Force Node.js runtime for crypto support
export const runtime = 'nodejs';

interface CreateUserRequest {
  username?: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

const TEMP_PASSWORD_VALIDITY_HOURS = 24;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // Check if current user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      );
    }

    // Get current user's profile to check role and organization
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !currentProfile) {
      return NextResponse.json(
        { error: 'Profil nicht gefunden' },
        { status: 404 }
      );
    }

    const userRole = (currentProfile as { role: string }).role;
    const organizationId = (currentProfile as { organization_id: string }).organization_id;

    // Only admins and owners can create users
    if (!['admin', 'owner'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Keine Berechtigung zum Erstellen von Benutzern' },
        { status: 403 }
      );
    }

    const body: CreateUserRequest = await request.json();
    const { firstName, lastName, role } = body;

    if (!firstName || !lastName || !role) {
      return NextResponse.json(
        { error: 'Vor- und Nachname sowie Rolle sind erforderlich' },
        { status: 400 }
      );
    }

    // Role hierarchy check: prevent creating users with equal or higher role
    const roleHierarchy: Record<string, number> = { employee: 1, manager: 2, owner: 3, admin: 4 };
    if (roleHierarchy[role] >= roleHierarchy[userRole]) {
      return NextResponse.json(
        { error: 'Keine Berechtigung: Kann keinen Benutzer mit gleichwertiger oder höherer Rolle erstellen' },
        { status: 403 }
      );
    }

    // Generate username first (needed for placeholder email)
    let username = body.username?.toLowerCase();

    // If no username provided, generate from name
    if (!username) {
      username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/[^a-z0-9.-]/g, '');
    }

    // Check for username collisions early
    const { data: existingUsernames } = await (serviceClient as any)
      .from('auth_credentials')
      .select('username');

    const usernameList = (existingUsernames || []).map((u: any) => u.username);
    username = generateUniqueUsername(username, usernameList);

    // Handle email - use provided or generate placeholder
    let email = body.email?.toLowerCase().trim();

    if (email) {
      // Validate email format if provided
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Ungültige E-Mail-Adresse' },
          { status: 400 }
        );
      }

      // Check if email already exists
      const { data: existingProfile } = await (serviceClient as any)
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (existingProfile) {
        return NextResponse.json(
          { error: 'E-Mail-Adresse wird bereits verwendet' },
          { status: 409 }
        );
      }
    } else {
      // Generate placeholder email using username
      // Using example.com as it's a reserved domain (RFC 2606)
      email = `${username}@example.com`;

      // Check if placeholder email already exists
      const { data: existingPlaceholder } = await (serviceClient as any)
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (existingPlaceholder) {
        return NextResponse.json(
          { error: 'Ein Benutzer mit diesem Namen existiert bereits' },
          { status: 409 }
        );
      }
    }

    // Generate temporary password
    const tempPassword = generateTempPassword(16);
    const passwordHash = await hashPassword(tempPassword);

    // Create auth user in Supabase with the temp password
    // This allows the user to also sign in via Supabase auth for RLS to work
    const { data: authUser, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password: tempPassword, // Same password for Supabase auth
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        username,
        organization_id: organizationId,
      },
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      // Handle duplicate email from Supabase Auth (orphaned auth users)
      if (authError.message?.includes('already been registered') || authError.status === 422) {
        return NextResponse.json(
          { error: 'Ein Benutzer mit dieser E-Mail existiert bereits im System. Bitte kontaktieren Sie den Administrator.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Fehler beim Erstellen des Benutzers: ${authError.message}` },
        { status: 500 }
      );
    }

    // Create or update profile (upsert handles case where trigger already created it)
    const { error: profileCreateError } = await (serviceClient as any)
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        email: email,
        first_name: firstName,
        last_name: lastName,
        role,
        organization_id: organizationId,
      }, { onConflict: 'id' });

    if (profileCreateError) {
      // Rollback: delete auth user
      await serviceClient.auth.admin.deleteUser(authUser.user.id);
      console.error('Profile creation error:', profileCreateError);
      return NextResponse.json(
        { error: `Fehler beim Erstellen des Profils: ${profileCreateError.message} (user_id: ${authUser.user.id}, email: ${email})` },
        { status: 500 }
      );
    }

    // Create auth credentials
    const tempPasswordExpires = new Date(
      Date.now() + TEMP_PASSWORD_VALIDITY_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { error: credError } = await (serviceClient as any)
      .from('auth_credentials')
      .insert({
        user_id: authUser.user.id,
        username,
        password_hash: passwordHash,
        must_change_password: true,
        temp_password_expires_at: tempPasswordExpires,
        organization_id: organizationId,
      });

    if (credError) {
      // Rollback: delete profile and auth user
      await serviceClient.from('profiles').delete().eq('id', authUser.user.id);
      await serviceClient.auth.admin.deleteUser(authUser.user.id);
      console.error('Credentials creation error:', credError);
      return NextResponse.json(
        { error: `Fehler beim Erstellen der Anmeldedaten: ${credError.message}` },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent(serviceClient, {
      user_id: authUser.user.id,
      username,
      event_type: 'user_created',
      ip_address: ip,
      user_agent: userAgent,
      details: {
        created_by: user.id,
        role,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: authUser.user.id,
        email: email.toLowerCase(),
        username,
        firstName,
        lastName,
        role,
      },
      tempPassword, // Only returned once!
      tempPasswordExpiresAt: tempPasswordExpires,
      message: `Benutzer wurde erstellt. Temporäres Passwort ist ${TEMP_PASSWORD_VALIDITY_HOURS} Stunden gültig.`,
    });
  } catch (error) {
    console.error('Create user error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function logAuditEvent(
  supabase: any,
  event: {
    user_id?: string;
    username?: string;
    event_type: string;
    ip_address?: string;
    user_agent?: string;
    details?: Record<string, any>;
  }
) {
  try {
    await supabase.from('auth_audit_log').insert({
      user_id: event.user_id,
      username: event.username,
      event_type: event.event_type,
      ip_address: event.ip_address,
      user_agent: event.user_agent,
      details: event.details,
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}
