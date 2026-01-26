/**
 * Script to check database state
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('=== Supabase Auth Users ===');
  const { data: authData } = await supabase.auth.admin.listUsers();
  authData?.users?.forEach(u => {
    console.log(`  ID: ${u.id}`);
    console.log(`  Email: ${u.email}`);
    console.log(`  Created: ${u.created_at}`);
    console.log('');
  });

  console.log('=== Profiles Table ===');
  const { data: profiles } = await supabase.from('profiles').select('*');
  profiles?.forEach(p => {
    console.log(`  ID: ${p.id}`);
    console.log(`  Email: ${p.email}`);
    console.log(`  Name: ${p.first_name} ${p.last_name}`);
    console.log(`  Role: ${p.role}`);
    console.log('');
  });

  console.log('=== Auth Credentials Table ===');
  const { data: creds } = await supabase.from('auth_credentials').select('*');
  creds?.forEach(c => {
    console.log(`  ID: ${c.id}`);
    console.log(`  User ID: ${c.user_id}`);
    console.log(`  Username: ${c.username}`);
    console.log('');
  });

  // Check for the specific ID from the error
  const problemId = 'e7d12f4a-9ec4-4a58-bb42-c91f17e83da8';
  console.log(`=== Checking problem ID: ${problemId} ===`);

  const { data: profileCheck } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', problemId)
    .single();

  if (profileCheck) {
    console.log('Found in profiles:', profileCheck);
  } else {
    console.log('NOT found in profiles');
  }
}

main().catch(console.error);
