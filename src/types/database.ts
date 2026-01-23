export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'manager' | 'worker';
export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'mixed';
export type TimeEntryStatus = 'active' | 'paused' | 'completed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssueCategory = 'damage' | 'cleaning' | 'safety' | 'maintenance' | 'other';
export type ChecklistItemType = 'checkbox' | 'text' | 'number' | 'photo';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          role: UserRole;
          avatar_url: string | null;
          push_subscription: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          push_subscription?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          push_subscription?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      properties: {
        Row: {
          id: string;
          name: string;
          address: string;
          city: string;
          postal_code: string;
          type: PropertyType;
          latitude: number | null;
          longitude: number | null;
          geofence_radius: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          city: string;
          postal_code: string;
          type?: PropertyType;
          latitude?: number | null;
          longitude?: number | null;
          geofence_radius?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          city?: string;
          postal_code?: string;
          type?: PropertyType;
          latitude?: number | null;
          longitude?: number | null;
          geofence_radius?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      property_assignments: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          property_id?: string;
          created_at?: string;
        };
      };
      work_days: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          start_time: string;
          end_time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          start_time: string;
          end_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          start_time?: string;
          end_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      time_entries: {
        Row: {
          id: string;
          work_day_id: string;
          user_id: string;
          property_id: string;
          start_time: string;
          end_time: string | null;
          pause_duration: number;
          status: TimeEntryStatus;
          start_latitude: number | null;
          start_longitude: number | null;
          end_latitude: number | null;
          end_longitude: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          work_day_id: string;
          user_id: string;
          property_id: string;
          start_time: string;
          end_time?: string | null;
          pause_duration?: number;
          status?: TimeEntryStatus;
          start_latitude?: number | null;
          start_longitude?: number | null;
          end_latitude?: number | null;
          end_longitude?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          work_day_id?: string;
          user_id?: string;
          property_id?: string;
          start_time?: string;
          end_time?: string | null;
          pause_duration?: number;
          status?: TimeEntryStatus;
          start_latitude?: number | null;
          start_longitude?: number | null;
          end_latitude?: number | null;
          end_longitude?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      checklist_templates: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          items: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          name: string;
          items: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          name?: string;
          items?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      checklist_instances: {
        Row: {
          id: string;
          template_id: string;
          time_entry_id: string;
          completed_items: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          time_entry_id: string;
          completed_items?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          time_entry_id?: string;
          completed_items?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      issues: {
        Row: {
          id: string;
          property_id: string;
          reported_by: string;
          assigned_to: string | null;
          category: IssueCategory;
          priority: IssuePriority;
          status: IssueStatus;
          title: string;
          description: string | null;
          photo_urls: string[];
          latitude: number | null;
          longitude: number | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          reported_by: string;
          assigned_to?: string | null;
          category: IssueCategory;
          priority?: IssuePriority;
          status?: IssueStatus;
          title: string;
          description?: string | null;
          photo_urls?: string[];
          latitude?: number | null;
          longitude?: number | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          reported_by?: string;
          assigned_to?: string | null;
          category?: IssueCategory;
          priority?: IssuePriority;
          status?: IssueStatus;
          title?: string;
          description?: string | null;
          photo_urls?: string[];
          latitude?: number | null;
          longitude?: number | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
      property_type: PropertyType;
      time_entry_status: TimeEntryStatus;
      issue_priority: IssuePriority;
      issue_status: IssueStatus;
      issue_category: IssueCategory;
    };
  };
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Property = Database['public']['Tables']['properties']['Row'];
export type PropertyAssignment = Database['public']['Tables']['property_assignments']['Row'];
export type WorkDay = Database['public']['Tables']['work_days']['Row'];
export type TimeEntry = Database['public']['Tables']['time_entries']['Row'];
export type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row'];
export type ChecklistInstance = Database['public']['Tables']['checklist_instances']['Row'];
export type Issue = Database['public']['Tables']['issues']['Row'];

// Insert types
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type PropertyInsert = Database['public']['Tables']['properties']['Insert'];
export type WorkDayInsert = Database['public']['Tables']['work_days']['Insert'];
export type TimeEntryInsert = Database['public']['Tables']['time_entries']['Insert'];
export type IssueInsert = Database['public']['Tables']['issues']['Insert'];

// Update types
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type PropertyUpdate = Database['public']['Tables']['properties']['Update'];
export type WorkDayUpdate = Database['public']['Tables']['work_days']['Update'];
export type TimeEntryUpdate = Database['public']['Tables']['time_entries']['Update'];
export type IssueUpdate = Database['public']['Tables']['issues']['Update'];

// Checklist item structure
export interface ChecklistItem {
  id: string;
  type: ChecklistItemType;
  label: string;
  required: boolean;
  order: number;
}

// Extended types with relations
export interface TimeEntryWithProperty extends TimeEntry {
  property: Property;
}

export interface IssueWithRelations extends Issue {
  property: Property;
  reporter: Profile;
  assignee: Profile | null;
}

export interface WorkDayWithEntries extends WorkDay {
  time_entries: TimeEntryWithProperty[];
}
