/**
 * Script to reset a user's password hash to bcrypt format
 *
 * Usage:
 * npx ts-node scripts/reset-user-password.ts <username> <new-password>
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcryptjs';

// Load environment variables from .env.local
config({ path: '.env.local' });

const BCRYPT_ROUNDS = 12;
const TEMP_PASSWORD_VALIDITY_HOURS = 168;

// Check environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.error('Usage: npx ts-node scripts/reset-user-password.ts <username> <new-password>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log(`Resetting password for user: ${username}`);

  // Find the user's credentials
  const { data: credentials, error: findError } = await supabase
    .from('auth_credentials')
    .select('*, profiles(*)')
    .eq('username', username.toLowerCase())
    .single();

  if (findError || !credentials) {
    console.error('User not found:', findError?.message || 'No matching username');
    process.exit(1);
  }

  console.log(`Found user: ${credentials.username} (${(credentials.profiles as any)?.email})`);

  // Hash the new password with bcrypt
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const tempPasswordExpires = new Date(
    Date.now() + TEMP_PASSWORD_VALIDITY_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Update credentials
  const { error: updateError } = await supabase
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
    console.error('Error updating credentials:', updateError.message);
    process.exit(1);
  }

  // Also update the Supabase auth password
  const { error: authError } = await supabase.auth.admin.updateUserById(
    credentials.user_id,
    { password: newPassword }
  );

  if (authError) {
    console.warn('Warning: Could not update Supabase auth password:', authError.message);
  }

  console.log('\n✓ Password reset successfully!');
  console.log(`Username: ${credentials.username}`);
  console.log(`New password: ${newPassword}`);
  console.log(`Expires: ${tempPasswordExpires}`);
  console.log('\nUser will be required to change password on first login.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
