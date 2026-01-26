-- Add completion_notes column to aufgaben table
-- This allows users to add notes when marking a task as completed

ALTER TABLE aufgaben ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN aufgaben.completion_notes IS 'Notes added when completing the task, describing the resolution';
