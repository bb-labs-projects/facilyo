export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'owner' | 'manager' | 'employee';

export type PermissionName =
  | 'manage_properties'
  | 'manage_employees'
  | 'manage_checklists'
  | 'manage_aufgaben'
  | 'assign_aufgaben'
  | 'convert_meldungen'
  | 'view_all_users'
  | 'update_user_roles'
  | 'access_admin_panel'
  | 'manage_role_permissions';
export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'mixed';
export type TimeEntryStatus = 'active' | 'paused' | 'completed';
export type TimeEntryType = 'property' | 'travel' | 'break';
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
          is_active: boolean;
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
          is_active?: boolean;
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
          is_active?: boolean;
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
          is_active: boolean;
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
          is_active?: boolean;
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
          is_active?: boolean;
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
          is_finalized: boolean;
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
          is_finalized?: boolean;
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
          is_finalized?: boolean;
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
          property_id: string | null;
          entry_type: TimeEntryType;
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
          property_id?: string | null;
          entry_type?: TimeEntryType;
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
          property_id?: string | null;
          entry_type?: TimeEntryType;
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
          converted_to_task: boolean;
          converted_at: string | null;
          converted_by: string | null;
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
          converted_to_task?: boolean;
          converted_at?: string | null;
          converted_by?: string | null;
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
          converted_to_task?: boolean;
          converted_at?: string | null;
          converted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      aufgaben: {
        Row: {
          id: string;
          property_id: string;
          source_meldung_id: string | null;
          created_by: string;
          assigned_to: string | null;
          title: string;
          description: string | null;
          priority: IssuePriority;
          status: IssueStatus;
          due_date: string | null;
          completed_at: string | null;
          completed_by: string | null;
          completion_photo_urls: string[];
          completion_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          source_meldung_id?: string | null;
          created_by: string;
          assigned_to?: string | null;
          title: string;
          description?: string | null;
          priority?: IssuePriority;
          status?: IssueStatus;
          due_date?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_photo_urls?: string[];
          completion_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          source_meldung_id?: string | null;
          created_by?: string;
          assigned_to?: string | null;
          title?: string;
          description?: string | null;
          priority?: IssuePriority;
          status?: IssueStatus;
          due_date?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_photo_urls?: string[];
          completion_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      checklist_item_completions: {
        Row: {
          id: string;
          checklist_instance_id: string;
          item_id: string;
          value_type: 'checkbox' | 'number' | 'text' | 'photo';
          boolean_value: boolean | null;
          numeric_value: number | null;
          text_value: string | null;
          completed_by: string | null;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          checklist_instance_id: string;
          item_id: string;
          value_type: 'checkbox' | 'number' | 'text' | 'photo';
          boolean_value?: boolean | null;
          numeric_value?: number | null;
          text_value?: string | null;
          completed_by?: string | null;
          completed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          checklist_instance_id?: string;
          item_id?: string;
          value_type?: 'checkbox' | 'number' | 'text' | 'photo';
          boolean_value?: boolean | null;
          numeric_value?: number | null;
          text_value?: string | null;
          completed_by?: string | null;
          completed_at?: string;
          created_at?: string;
        };
      };
      auth_credentials: {
        Row: {
          id: string;
          user_id: string;
          username: string;
          password_hash: string;
          must_change_password: boolean;
          temp_password_expires_at: string | null;
          failed_attempts: number;
          locked_until: string | null;
          last_login_at: string | null;
          password_changed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          username: string;
          password_hash: string;
          must_change_password?: boolean;
          temp_password_expires_at?: string | null;
          failed_attempts?: number;
          locked_until?: string | null;
          last_login_at?: string | null;
          password_changed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          username?: string;
          password_hash?: string;
          must_change_password?: boolean;
          temp_password_expires_at?: string | null;
          failed_attempts?: number;
          locked_until?: string | null;
          last_login_at?: string | null;
          password_changed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      auth_audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          username: string | null;
          event_type: string;
          ip_address: string | null;
          user_agent: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          username?: string | null;
          event_type: string;
          ip_address?: string | null;
          user_agent?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          username?: string | null;
          event_type?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          details?: Json | null;
          created_at?: string;
        };
      };
      role_permissions: {
        Row: {
          id: string;
          role: UserRole;
          permission: PermissionName;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          role: UserRole;
          permission: PermissionName;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          permission?: PermissionName;
          enabled?: boolean;
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
      time_entry_type: TimeEntryType;
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
export type Aufgabe = Database['public']['Tables']['aufgaben']['Row'];
export type ChecklistItemCompletion = Database['public']['Tables']['checklist_item_completions']['Row'];
export type AuthCredentials = Database['public']['Tables']['auth_credentials']['Row'];
export type AuthAuditLog = Database['public']['Tables']['auth_audit_log']['Row'];
export type RolePermission = Database['public']['Tables']['role_permissions']['Row'];

// Insert types
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type PropertyInsert = Database['public']['Tables']['properties']['Insert'];
export type WorkDayInsert = Database['public']['Tables']['work_days']['Insert'];
export type TimeEntryInsert = Database['public']['Tables']['time_entries']['Insert'];
export type ChecklistTemplateInsert = Database['public']['Tables']['checklist_templates']['Insert'];
export type IssueInsert = Database['public']['Tables']['issues']['Insert'];
export type AufgabeInsert = Database['public']['Tables']['aufgaben']['Insert'];
export type ChecklistItemCompletionInsert = Database['public']['Tables']['checklist_item_completions']['Insert'];

// Update types
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type PropertyUpdate = Database['public']['Tables']['properties']['Update'];
export type WorkDayUpdate = Database['public']['Tables']['work_days']['Update'];
export type TimeEntryUpdate = Database['public']['Tables']['time_entries']['Update'];
export type ChecklistTemplateUpdate = Database['public']['Tables']['checklist_templates']['Update'];
export type IssueUpdate = Database['public']['Tables']['issues']['Update'];
export type AufgabeUpdate = Database['public']['Tables']['aufgaben']['Update'];

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
  property: Property | null;
}

export interface IssueWithRelations extends Issue {
  property: Property;
  reporter: Profile;
  assignee: Profile | null;
}

export interface WorkDayWithEntries extends WorkDay {
  time_entries: TimeEntryWithProperty[];
}

export interface AufgabeWithRelations extends Aufgabe {
  property: Property;
  creator: Profile;
  assignee: Profile | null;
  source_meldung: Issue | null;
}
