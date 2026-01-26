import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/password';

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MINUTES = 30;

interface LoginRequest {
  username: string;
  password: string;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    const body: LoginRequest = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Benutzername und Passwort sind erforderlich' },
        { status: 400 }
      );
    }

    // Fetch auth credentials by username
    const { data: credentials, error: credError } = await (supabase as any)
      .from('auth_credentials')
      .select('*, profiles(*)')
      .eq('username', username.toLowerCase())
      .single();

    if (credError || !credentials) {
      // Log failed attempt (unknown user)
      await logAuditEvent(supabase, {
        username,
        event_type: 'login_failed_unknown_user',
        ip_address: ip,
        user_agent: userAgent,
      });

      return NextResponse.json(
        { error: 'Ungültiger Benutzername oder Passwort' },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (credentials.locked_until && new Date(credentials.locked_until) > new Date()) {
      const minutesRemaining = Math.ceil(
        (new Date(credentials.locked_until).getTime() - Date.now()) / (1000 * 60)
      );

      await logAuditEvent(supabase, {
        user_id: credentials.user_id,
        username,
        event_type: 'login_attempt_while_locked',
        ip_address: ip,
        user_agent: userAgent,
      });

      return NextResponse.json(
        {
          error: `Account ist gesperrt. Bitte versuchen Sie es in ${minutesRemaining} Minuten erneut.`,
          locked: true,
          minutesRemaining,
        },
        { status: 423 }
      );
    }

    // Check if user profile is active
    const profile = credentials.profiles as any;
    if (!profile) {
      return NextResponse.json(
        { error: 'Benutzerprofil nicht gefunden' },
        { status: 401 }
      );
    }

    // Verify password against our Argon2 hash
    const isValidPassword = await verifyPassword(password, credentials.password_hash);

    if (!isValidPassword) {
      // Increment failed attempts
      const newFailedAttempts = (credentials.failed_attempts || 0) + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

      const updateData: any = {
        failed_attempts: newFailedAttempts,
      };

      if (shouldLock) {
        updateData.locked_until = new Date(
          Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
        ).toISOString();
      }

      await (supabase as any)
        .from('auth_credentials')
        .update(updateData)
        .eq('id', credentials.id);

      await logAuditEvent(supabase, {
        user_id: credentials.user_id,
        username,
        event_type: shouldLock ? 'account_locked' : 'login_failed',
        ip_address: ip,
        user_agent: userAgent,
        details: { failed_attempts: newFailedAttempts },
      });

      if (shouldLock) {
        return NextResponse.json(
          {
            error: `Zu viele fehlgeschlagene Versuche. Account ist für ${LOCKOUT_DURATION_MINUTES} Minuten gesperrt.`,
            locked: true,
            minutesRemaining: LOCKOUT_DURATION_MINUTES,
          },
          { status: 423 }
        );
      }

      const attemptsRemaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;
      return NextResponse.json(
        {
          error: `Ungültiger Benutzername oder Passwort. ${attemptsRemaining} Versuche verbleibend.`,
          attemptsRemaining,
        },
        { status: 401 }
      );
    }

    // Check if temp password has expired
    if (
      credentials.temp_password_expires_at &&
      new Date(credentials.temp_password_expires_at) < new Date()
    ) {
      await logAuditEvent(supabase, {
        user_id: credentials.user_id,
        username,
        event_type: 'login_failed_temp_password_expired',
        ip_address: ip,
        user_agent: userAgent,
      });

      return NextResponse.json(
        {
          error: 'Temporäres Passwort ist abgelaufen. Bitte kontaktieren Sie den Administrator.',
          tempPasswordExpired: true,
        },
        { status: 401 }
      );
    }

    // Login successful - reset failed attempts and update last login
    await (supabase as any)
      .from('auth_credentials')
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', credentials.id);

    await logAuditEvent(supabase, {
      user_id: credentials.user_id,
      username,
      event_type: 'login_success',
      ip_address: ip,
      user_agent: userAgent,
    });

    // Return success with user data
    // The client will handle Supabase session creation using the email/password
    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        username: credentials.username,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
      },
      mustChangePassword: credentials.must_change_password,
    });
  } catch (error) {
    console.error('Login error:', error);
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
