import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface UnlockRequest {
  userId: string;
}

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

    // Only admins and owners can unlock accounts
    if (!['admin', 'owner'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Keine Berechtigung zum Entsperren von Accounts' },
        { status: 403 }
      );
    }

    const body: UnlockRequest = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Benutzer-ID ist erforderlich' },
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

    // Check if account is actually locked
    if (!credentials.locked_until || new Date(credentials.locked_until) <= new Date()) {
      return NextResponse.json(
        { error: 'Account ist nicht gesperrt' },
        { status: 400 }
      );
    }

    // Unlock the account
    const { error: updateError } = await (serviceClient as any)
      .from('auth_credentials')
      .update({
        locked_until: null,
        failed_attempts: 0,
      })
      .eq('id', credentials.id);

    if (updateError) {
      console.error('Unlock error:', updateError);
      return NextResponse.json(
        { error: 'Fehler beim Entsperren des Accounts' },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent(serviceClient, {
      user_id: userId,
      username: credentials.username,
      event_type: 'account_unlocked_by_admin',
      ip_address: ip,
      user_agent: userAgent,
      details: {
        unlocked_by: user.id,
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
      message: 'Account wurde entsperrt',
    });
  } catch (error) {
    console.error('Unlock error:', error);
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
