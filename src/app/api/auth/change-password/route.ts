import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { validatePassword } from '@/lib/auth/validation';

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      );
    }

    const body: ChangePasswordRequest = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Aktuelles und neues Passwort sind erforderlich' },
        { status: 400 }
      );
    }

    // Fetch auth credentials for current user
    const { data: credentials, error: credError } = await (serviceClient as any)
      .from('auth_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      return NextResponse.json(
        { error: 'Authentifizierungsdaten nicht gefunden' },
        { status: 404 }
      );
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, credentials.password_hash);

    if (!isValidPassword) {
      await logAuditEvent(serviceClient, {
        user_id: user.id,
        username: credentials.username,
        event_type: 'password_change_failed_wrong_current',
        ip_address: ip,
        user_agent: userAgent,
      });

      return NextResponse.json(
        { error: 'Aktuelles Passwort ist falsch' },
        { status: 401 }
      );
    }

    // Validate new password strength
    const validation = validatePassword(newPassword, [
      credentials.username,
      user.email || '',
    ]);

    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: 'Neues Passwort erfüllt die Anforderungen nicht',
          validationErrors: validation.errors,
          suggestions: validation.suggestions,
          score: validation.score,
        },
        { status: 400 }
      );
    }

    // Check that new password is different from current
    const isSamePassword = await verifyPassword(newPassword, credentials.password_hash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'Neues Passwort muss sich vom aktuellen unterscheiden' },
        { status: 400 }
      );
    }

    // Hash new password and update our auth_credentials
    const newHash = await hashPassword(newPassword);

    const { error: updateError } = await (serviceClient as any)
      .from('auth_credentials')
      .update({
        password_hash: newHash,
        must_change_password: false,
        temp_password_expires_at: null,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', credentials.id);

    if (updateError) {
      console.error('Password update error:', updateError);
      return NextResponse.json(
        { error: 'Fehler beim Aktualisieren des Passworts' },
        { status: 500 }
      );
    }

    // Also update the password in Supabase auth for session/RLS compatibility
    const { error: supabaseUpdateError } = await serviceClient.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (supabaseUpdateError) {
      console.error('Supabase password update error:', supabaseUpdateError);
      // Don't fail the request, our auth_credentials is the source of truth
    }

    await logAuditEvent(serviceClient, {
      user_id: user.id,
      username: credentials.username,
      event_type: 'password_changed',
      ip_address: ip,
      user_agent: userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Passwort wurde erfolgreich geändert',
    });
  } catch (error) {
    console.error('Change password error:', error);
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
