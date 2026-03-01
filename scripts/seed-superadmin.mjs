import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const EMAIL = 'erich@bb-labs.ch';
const USERNAME = 'erich';
const FIRST_NAME = 'Erich';
const LAST_NAME = 'Admin';
const PASSWORD = 'Admin1234!';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log('Creating super admin user...');

  // 1. Create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: FIRST_NAME,
      last_name: LAST_NAME,
      username: USERNAME,
      organization_id: DEFAULT_ORG_ID,
    },
  });

  if (authError) {
    console.error('Failed to create auth user:', authError.message);
    process.exit(1);
  }

  const userId = authUser.user.id;
  console.log('Auth user created:', userId);

  // 2. Upsert profile (trigger may have created it)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: EMAIL,
      first_name: FIRST_NAME,
      last_name: LAST_NAME,
      role: 'admin',
      is_active: true,
      organization_id: DEFAULT_ORG_ID,
      is_super_admin: true,
    }, { onConflict: 'id' });

  if (profileError) {
    console.error('Failed to upsert profile:', profileError.message);
    process.exit(1);
  }
  console.log('Profile created with is_super_admin = true');

  // 3. Create auth_credentials
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { error: credError } = await supabase
    .from('auth_credentials')
    .insert({
      user_id: userId,
      username: USERNAME,
      password_hash: passwordHash,
      must_change_password: false,
      organization_id: DEFAULT_ORG_ID,
    });

  if (credError) {
    console.error('Failed to create auth_credentials:', credError.message);
    process.exit(1);
  }
  console.log('Auth credentials created');

  console.log('\n--- Super Admin Created ---');
  console.log(`Email:    ${EMAIL}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD}`);
  console.log('Please change this password after first login!');
}

seed().catch(console.error);
