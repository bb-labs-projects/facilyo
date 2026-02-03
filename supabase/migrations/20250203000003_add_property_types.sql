-- Migration: Add new property types (office, private_maintenance)

ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'office';
ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'private_maintenance';
