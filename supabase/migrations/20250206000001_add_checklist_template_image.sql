-- Add image_url column to checklist_templates for reference images
ALTER TABLE checklist_templates ADD COLUMN image_url TEXT DEFAULT NULL;
