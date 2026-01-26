/**
 * Script to clean up orphaned users in Supabase Auth
 * (users that exist in auth but not in profiles table)
 *
 * Usage:
 * npx dotenv -e .env.local -- npx ts-node scripts/cleanup-orphaned-users.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log('Checking for orphaned users...\n');

  // Get all auth users
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('Error fetching auth users:', authError.message);
    process.exit(1);
  }

  const authUsers = authData?.users || [];
  console.log(`Found ${authUsers.length} users in Supabase Auth`);

  // Get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError.message);
    process.exit(1);
  }

  console.log(`Found ${profiles?.length || 0} profiles in database`);

  const profileIds = new Set((profiles || []).map(p => p.id));

  // Find orphaned auth users (in auth but not in profiles)
  const orphanedUsers = authUsers.filter(u => !profileIds.has(u.id));

  if (orphanedUsers.length === 0) {
    console.log('\n✓ No orphaned users found!');
    return;
  }

  console.log(`\nFound ${orphanedUsers.length} orphaned users:`);
  orphanedUsers.forEach(u => {
    console.log(`  - ${u.email} (ID: ${u.id})`);
  });

  console.log('\nDeleting orphaned users...');

  for (const user of orphanedUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`  ✗ Failed to delete ${user.email}: ${error.message}`);
    } else {
      console.log(`  ✓ Deleted ${user.email}`);
    }
  }

  console.log('\nCleanup complete!');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
