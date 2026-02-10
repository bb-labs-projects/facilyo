import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hashPassword, generateTempPassword } from '@/lib/auth/password';

// Force Node.js runtime for bcrypt support
export const runtime = 'nodejs';

interface ResetPasswordRequest {
  userId: string;
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

    // Get current user's profile to check role
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !currentProfile) {
      return NextResponse.json(
        { error: 'Profil nicht gefunden' },
        { status: 404 }
      );
    }

    const userRole = (currentProfile as { role: string }).role;

    // Only admins and owners can reset passwords
    if (!['admin', 'owner'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Keine Berechtigung zum Zurücksetzen von Passwörtern' },
        { status: 403 }
      );
    }

    const body: ResetPasswordRequest = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Benutzer-ID ist erforderlich' },
        { status: 400 }
      );
    }

    // Prevent admin from resetting their own password through this endpoint
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Eigenes Passwort kann nicht über diese Funktion zurückgesetzt werden' },
        { status: 400 }
      );
    }

    // Fetch target user's credentials
    const { data: credentials, error: credError } = await (serviceClient as any)
      .from('auth_credentials')
      .select('*, profiles(*)')
      .eq('user_id', userId)
      .single();

    if (credError || !credentials) {
      return NextResponse.json(
        { error: 'Benutzer nicht gefunden' },
        { status: 404 }
      );
    }

    // Role hierarchy check: prevent acting on users with equal or higher role
    const roleHierarchy: Record<string, number> = { employee: 1, manager: 2, owner: 3, admin: 4 };
    const targetRole = (credentials.profiles as any)?.role as string;
    if (targetRole && roleHierarchy[userRole] <= roleHierarchy[targetRole]) {
      return NextResponse.json(
        { error: 'Keine Berechtigung: Zielbenutzer hat eine gleichwertige oder höhere Rolle' },
        { status: 403 }
      );
    }

    // Generate new temporary password
    const tempPassword = generateTempPassword(16);
    const passwordHash = await hashPassword(tempPassword);
    const tempPasswordExpires = new Date(
      Date.now() + TEMP_PASSWORD_VALIDITY_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Update credentials in our auth_credentials table
    const { error: updateError } = await (serviceClient as any)
      .from('auth_credentials')
      .update({
        password_hash: passwordHash,
        must_change_password: true,
        temp_password_expires_at: tempPasswordExpires,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq('id', credentials.id);

    if (updateError) {
      console.error('Password reset error:', updateError);
      return NextResponse.json(
        { error: 'Fehler beim Zurücksetzen des Passworts' },
        { status: 500 }
      );
    }

    // Also update the password in Supabase auth for session/RLS compatibility
    const { error: supabaseUpdateError } = await serviceClient.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    );

    if (supabaseUpdateError) {
      console.error('Supabase password update error:', supabaseUpdateError);
      // Don't fail the request, our auth_credentials is the source of truth
    }

    // Invalidate all existing sessions for this user
    try {
      await serviceClient.auth.admin.signOut(userId);
    } catch {
      // Ignore sign out errors
    }

    // Log audit event
    await logAuditEvent(serviceClient, {
      user_id: userId,
      username: credentials.username,
      event_type: 'password_reset_by_admin',
      ip_address: ip,
      user_agent: userAgent,
      details: {
        reset_by: user.id,
      },
    });

    const profile = credentials.profiles as any;

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        username: credentials.username,
        firstName: profile?.first_name,
        lastName: profile?.last_name,
      },
      tempPassword, // Only returned once!
      tempPasswordExpiresAt: tempPasswordExpires,
      message: `Passwort wurde zurückgesetzt. Temporäres Passwort ist ${TEMP_PASSWORD_VALIDITY_HOURS} Stunden gültig.`,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Ein unerwarteter Fehler ist aufgetreten' },
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
