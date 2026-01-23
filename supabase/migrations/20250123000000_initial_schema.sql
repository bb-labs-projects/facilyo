-- FacilityTrack Database Schema
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'worker');
CREATE TYPE property_type AS ENUM ('residential', 'commercial', 'industrial', 'mixed');
CREATE TYPE time_entry_status AS ENUM ('active', 'paused', 'completed');
CREATE TYPE issue_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE issue_category AS ENUM ('damage', 'cleaning', 'safety', 'maintenance', 'other');

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role user_role DEFAULT 'worker',
  avatar_url TEXT,
  push_subscription JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Properties table
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  type property_type DEFAULT 'residential',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geofence_radius INTEGER DEFAULT 100, -- meters
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Property assignments (many-to-many: users <-> properties)
CREATE TABLE property_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

-- Work days table
CREATE TABLE work_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Time entries table
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_day_id UUID NOT NULL REFERENCES work_days(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  pause_duration INTEGER DEFAULT 0, -- seconds
  status time_entry_status DEFAULT 'active',
  start_latitude DECIMAL(10, 8),
  start_longitude DECIMAL(11, 8),
  end_latitude DECIMAL(10, 8),
  end_longitude DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Checklist templates
CREATE TABLE checklist_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Checklist instances (linked to time entries)
CREATE TABLE checklist_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  completed_items JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issues table
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category issue_category NOT NULL,
  priority issue_priority DEFAULT 'medium',
  status issue_status DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_property_assignments_user ON property_assignments(user_id);
CREATE INDEX idx_property_assignments_property ON property_assignments(property_id);
CREATE INDEX idx_work_days_user_date ON work_days(user_id, date);
CREATE INDEX idx_time_entries_work_day ON time_entries(work_day_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_property ON time_entries(property_id);
CREATE INDEX idx_time_entries_status ON time_entries(status);
CREATE INDEX idx_issues_property ON issues(property_id);
CREATE INDEX idx_issues_reported_by ON issues(reported_by);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_priority ON issues(priority);
CREATE INDEX idx_checklist_templates_property ON checklist_templates(property_id);

-- Spatial index for properties (if using PostGIS)
-- CREATE INDEX idx_properties_location ON properties USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_work_days_updated_at
  BEFORE UPDATE ON work_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_checklist_templates_updated_at
  BEFORE UPDATE ON checklist_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_checklist_instances_updated_at
  BEFORE UPDATE ON checklist_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Properties policies (users can view assigned properties)
CREATE POLICY "Users can view assigned properties"
  ON properties FOR SELECT
  USING (
    id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Property assignments policies
CREATE POLICY "Users can view their assignments"
  ON property_assignments FOR SELECT
  USING (user_id = auth.uid());

-- Work days policies
CREATE POLICY "Users can view their own work days"
  ON work_days FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own work days"
  ON work_days FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own work days"
  ON work_days FOR UPDATE
  USING (user_id = auth.uid());

-- Time entries policies
CREATE POLICY "Users can view their own time entries"
  ON time_entries FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own time entries"
  ON time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own time entries"
  ON time_entries FOR UPDATE
  USING (user_id = auth.uid());

-- Checklist templates policies
CREATE POLICY "Users can view templates for assigned properties"
  ON checklist_templates FOR SELECT
  USING (
    property_id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
  );

-- Checklist instances policies
CREATE POLICY "Users can view their checklist instances"
  ON checklist_instances FOR SELECT
  USING (
    time_entry_id IN (
      SELECT id FROM time_entries
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create checklist instances"
  ON checklist_instances FOR INSERT
  WITH CHECK (
    time_entry_id IN (
      SELECT id FROM time_entries
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their checklist instances"
  ON checklist_instances FOR UPDATE
  USING (
    time_entry_id IN (
      SELECT id FROM time_entries
      WHERE user_id = auth.uid()
    )
  );

-- Issues policies
CREATE POLICY "Users can view issues for assigned properties"
  ON issues FOR SELECT
  USING (
    property_id IN (
      SELECT property_id FROM property_assignments
      WHERE user_id = auth.uid()
    )
    OR reported_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Users can create issues"
  ON issues FOR INSERT
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Users can update their own issues"
  ON issues FOR UPDATE
  USING (
    reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Storage bucket for photos
-- Run this in Storage section of Supabase dashboard or via API
-- CREATE BUCKET photos;
-- Set bucket to public or add appropriate policies
