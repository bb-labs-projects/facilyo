/**
 * Migration script to convert base64 photos in checklist_instances to Supabase storage URLs
 *
 * Run with: npx tsx scripts/migrate-base64-photos.ts
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
function loadEnvFile() {
  try {
    const envContent = readFileSync('.env.local', 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // .env.local not found, continue with existing env vars
  }
}

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ChecklistInstance {
  id: string;
  completed_items: Record<string, unknown>;
}

function isBase64DataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

async function base64ToBlob(base64: string): Promise<Blob> {
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

async function uploadToStorage(base64: string, index: number): Promise<string> {
  const blob = await base64ToBlob(base64);

  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  const extension = blob.type.split('/')[1] || 'jpg';
  const filename = `migrated-${timestamp}-${index}-${random}.${extension}`;
  const path = `checklists/${filename}`;

  const { data, error } = await supabase.storage
    .from('photos')
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('photos')
    .getPublicUrl(data.path);

  return publicUrl;
}

async function migrateInstance(instance: ChecklistInstance): Promise<boolean> {
  const completedItems = instance.completed_items;
  let hasChanges = false;
  let photoIndex = 0;

  for (const [key, value] of Object.entries(completedItems)) {
    if (isBase64DataUrl(value)) {
      console.log(`  - Migrating photo for key "${key}"...`);
      try {
        const url = await uploadToStorage(value, photoIndex++);
        completedItems[key] = url;
        hasChanges = true;
        console.log(`    ✓ Uploaded to: ${url}`);
      } catch (error) {
        console.error(`    ✗ Failed to upload:`, error);
      }
    }
  }

  if (hasChanges) {
    const { error } = await supabase
      .from('checklist_instances')
      .update({ completed_items: completedItems })
      .eq('id', instance.id);

    if (error) {
      console.error(`  ✗ Failed to update instance ${instance.id}:`, error.message);
      return false;
    }
    console.log(`  ✓ Instance ${instance.id} updated`);
  }

  return hasChanges;
}

async function main() {
  console.log('Starting base64 photo migration...\n');

  // Fetch all checklist instances
  const { data: instances, error } = await supabase
    .from('checklist_instances')
    .select('id, completed_items');

  if (error) {
    console.error('Failed to fetch instances:', error.message);
    process.exit(1);
  }

  if (!instances || instances.length === 0) {
    console.log('No checklist instances found.');
    return;
  }

  console.log(`Found ${instances.length} checklist instances.\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const instance of instances) {
    // Check if this instance has any base64 photos
    const hasBase64 = Object.values(instance.completed_items || {}).some(isBase64DataUrl);

    if (hasBase64) {
      console.log(`Processing instance ${instance.id}...`);
      const migrated = await migrateInstance(instance as ChecklistInstance);
      if (migrated) {
        migratedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`Migrated: ${migratedCount} instances`);
  console.log(`Skipped (no base64): ${skippedCount} instances`);
}

main().catch(console.error);
