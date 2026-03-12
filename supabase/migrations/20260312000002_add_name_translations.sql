-- Add name_translations column to checklist_templates for translated checklist names
ALTER TABLE checklist_templates ADD COLUMN name_translations jsonb DEFAULT '{}'::jsonb;
