/**
 * Migration Script: Migrate existing users to username-based authentication
 *
 * This script:
 * 1. Loads all existing profiles
 * 2. Generates usernames from emails
 * 3. Generates temporary passwords
 * 4. Creates auth_credentials entries
 * 5. Exports a CSV with credentials
 *
 * Usage:
 * 1. Set environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 2. Run: npx ts-node scripts/migrate-users-to-username.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';

// Configuration
const TEMP_PASSWORD_LENGTH = 16;
const TEMP_PASSWORD_VALIDITY_HOURS = 168; // 1 week for migration
const OUTPUT_FILE = 'user-credentials.csv';

// Bcrypt cost factor
const BCRYPT_ROUNDS = 12;

// Check environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Generate a secure temporary password
 */
function generateTempPassword(length: number = TEMP_PASSWORD_LENGTH): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * Generate username from email
 */
function generateUsernameFromEmail(email: string): string {
  const localPart = email.split('@')[0];
  const cleaned = localPart.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  return cleaned || 'user';
}

/**
 * Generate unique username
 */
function generateUniqueUsername(baseUsername: string, existingUsernames: Set<string>): string {
  if (!existingUsernames.has(baseUsername)) {
    return baseUsername;
  }

  let suffix = 1;
  while (existingUsernames.has(`${baseUsername}${suffix}`)) {
    suffix++;
  }

  return `${baseUsername}${suffix}`;
}

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface MigrationResult {
  userId: string;
  email: string;
  username: string;
  tempPassword: string;
  firstName: string | null;
  lastName: string | null;
}

async function main() {
  console.log('Starting user migration to username-based auth...\n');

  // 1. Fetch all profiles
  console.log('Fetching existing profiles...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .order('email');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log('No profiles found. Nothing to migrate.');
    process.exit(0);
  }

  console.log(`Found ${profiles.length} profiles to migrate.\n`);

  // 2. Check for existing auth_credentials
  console.log('Checking for existing auth_credentials...');
  const { data: existingCreds, error: credsError } = await supabase
    .from('auth_credentials')
    .select('user_id, username');

  if (credsError) {
    console.error('Error fetching existing credentials:', credsError);
    process.exit(1);
  }

  const existingUserIds = new Set((existingCreds || []).map((c: any) => c.user_id));
  const existingUsernames = new Set((existingCreds || []).map((c: any) => c.username));

  // Filter out already migrated users
  const profilesToMigrate = (profiles as Profile[]).filter((p) => !existingUserIds.has(p.id));

  if (profilesToMigrate.length === 0) {
    console.log('All users have already been migrated.');
    process.exit(0);
  }

  console.log(`${profilesToMigrate.length} profiles need migration.\n`);

  // 3. Generate credentials for each user
  console.log('Generating credentials...');
  const results: MigrationResult[] = [];
  const tempPasswordExpires = new Date(
    Date.now() + TEMP_PASSWORD_VALIDITY_HOURS * 60 * 60 * 1000
  ).toISOString();

  for (const profile of profilesToMigrate) {
    const baseUsername = generateUsernameFromEmail(profile.email);
    const username = generateUniqueUsername(baseUsername, existingUsernames);
    existingUsernames.add(username); // Track to avoid collisions

    const tempPassword = generateTempPassword();

    results.push({
      userId: profile.id,
      email: profile.email,
      username,
      tempPassword,
      firstName: profile.first_name,
      lastName: profile.last_name,
    });
  }

  // 4. Insert credentials into database
  console.log('Inserting credentials into database...');
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    try {
      const passwordHash = await bcrypt.hash(result.tempPassword, BCRYPT_ROUNDS);

      const { error: insertError } = await supabase.from('auth_credentials').insert({
        user_id: result.userId,
        username: result.username,
        password_hash: passwordHash,
        must_change_password: true,
        temp_password_expires_at: tempPasswordExpires,
      });

      if (insertError) {
        console.error(`Error inserting credentials for ${result.email}:`, insertError);
        errorCount++;
      } else {
        successCount++;
        console.log(`✓ Migrated: ${result.email} -> @${result.username}`);
      }
    } catch (err) {
      console.error(`Error processing ${result.email}:`, err);
      errorCount++;
    }
  }

  // 5. Export CSV
  console.log(`\nExporting credentials to ${OUTPUT_FILE}...`);
  const csvHeader = 'Email,Username,Temporary Password,First Name,Last Name\n';
  const csvRows = results
    .map(
      (r) =>
        `"${r.email}","${r.username}","${r.tempPassword}","${r.firstName || ''}","${r.lastName || ''}"`
    )
    .join('\n');

  fs.writeFileSync(OUTPUT_FILE, csvHeader + csvRows, 'utf-8');

  // 6. Summary
  console.log('\n========================================');
  console.log('Migration Complete');
  console.log('========================================');
  console.log(`Total profiles: ${profiles.length}`);
  console.log(`Already migrated: ${profiles.length - profilesToMigrate.length}`);
  console.log(`Successfully migrated: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`\nCredentials exported to: ${OUTPUT_FILE}`);
  console.log(`Temporary passwords valid until: ${tempPasswordExpires}`);
  console.log('\nIMPORTANT: Distribute credentials securely and delete the CSV file afterwards!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
