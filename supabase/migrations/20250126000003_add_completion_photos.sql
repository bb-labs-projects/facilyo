-- Add completion_photo_urls column to aufgaben table
-- This allows users to attach photos when marking a task as completed

ALTER TABLE aufgaben ADD COLUMN IF NOT EXISTS completion_photo_urls text[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN aufgaben.completion_photo_urls IS 'URLs of photos uploaded when completing the task';
