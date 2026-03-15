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
  | 'manage_role_permissions'
  | 'manage_user_calendar'
  | 'delete_activity'
  | 'manage_vacations'
  | 'manage_invoices';
export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'mixed' | 'office' | 'private_maintenance';
export type TimeEntryStatus = 'active' | 'paused' | 'completed';
export type TimeEntryType = 'property' | 'travel' | 'break' | 'vacation';
export type VacationStatus = 'pending' | 'approved' | 'rejected';
export type HalfDayPeriod = 'morning' | 'afternoon';
export type ActivityType = 'hauswartung' | 'rasen_maehen' | 'hecken_schneiden' | 'regie' | 'reinigung';
export type InvoiceStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type InvoiceLineItemType = 'subscription' | 'hours' | 'manual';
export type SubscriptionInterval = 'monthly' | 'quarterly' | 'half_yearly' | 'annually';
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssueCategory = 'damage' | 'cleaning' | 'safety' | 'maintenance' | 'other';
export type ChecklistItemType = 'checkbox' | 'text' | 'number' | 'photo';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          contact_email: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          contact_email?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          contact_email?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
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
          vacation_days_per_year: number;
          organization_id: string;
          is_super_admin: boolean;
          preferred_locale: string;
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
          vacation_days_per_year?: number;
          organization_id: string;
          is_super_admin?: boolean;
          preferred_locale?: string;
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
          vacation_days_per_year?: number;
          organization_id?: string;
          is_super_admin?: boolean;
          preferred_locale?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          contact_person: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          contact_person?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          postal_code?: string | null;
          city?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          contact_person?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          postal_code?: string | null;
          city?: string | null;
          notes?: string | null;
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
          organization_id: string;
          client_id: string | null;
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
          organization_id: string;
          client_id?: string | null;
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
          organization_id?: string;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      property_assignments: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          property_id?: string;
          organization_id?: string;
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
          organization_id: string;
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
          organization_id: string;
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
          organization_id?: string;
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
          activity_type: ActivityType | null;
          start_time: string;
          end_time: string | null;
          pause_duration: number;
          status: TimeEntryStatus;
          start_latitude: number | null;
          start_longitude: number | null;
          end_latitude: number | null;
          end_longitude: number | null;
          notes: string | null;
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          work_day_id: string;
          user_id: string;
          property_id?: string | null;
          organization_id: string;
          entry_type?: TimeEntryType;
          activity_type?: ActivityType | null;
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
          organization_id?: string;
          entry_type?: TimeEntryType;
          activity_type?: ActivityType | null;
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
          name_translations: Json;
          items: Json;
          image_url: string | null;
          is_active: boolean;
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          name: string;
          name_translations?: Json;
          items: Json;
          image_url?: string | null;
          is_active?: boolean;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          name?: string;
          name_translations?: Json;
          items?: Json;
          image_url?: string | null;
          is_active?: boolean;
          organization_id?: string;
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
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          time_entry_id: string;
          completed_items?: Json;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          time_entry_id?: string;
          completed_items?: Json;
          organization_id?: string;
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
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          reported_by: string;
          assigned_to?: string | null;
          organization_id: string;
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
          organization_id?: string;
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
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          source_meldung_id?: string | null;
          created_by: string;
          organization_id: string;
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
          organization_id?: string;
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
          organization_id: string;
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
          organization_id: string;
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
          organization_id?: string;
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
          organization_id: string;
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
          organization_id: string;
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
          organization_id?: string;
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
          organization_id: string | null;
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
          organization_id?: string | null;
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
          organization_id?: string | null;
          created_at?: string;
        };
      };
      role_permissions: {
        Row: {
          id: string;
          role: UserRole;
          permission: PermissionName;
          enabled: boolean;
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          role: UserRole;
          permission: PermissionName;
          enabled?: boolean;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          permission?: PermissionName;
          enabled?: boolean;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      vacation_requests: {
        Row: {
          id: string;
          user_id: string;
          start_date: string;
          end_date: string;
          is_half_day: boolean;
          half_day_period: HalfDayPeriod | null;
          total_days: number;
          status: VacationStatus;
          notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          start_date: string;
          end_date: string;
          is_half_day?: boolean;
          half_day_period?: HalfDayPeriod | null;
          total_days: number;
          status?: VacationStatus;
          notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          start_date?: string;
          end_date?: string;
          is_half_day?: boolean;
          half_day_period?: HalfDayPeriod | null;
          total_days?: number;
          status?: VacationStatus;
          notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      organization_billing_settings: {
        Row: {
          id: string;
          organization_id: string;
          company_name: string | null;
          company_address: string | null;
          company_postal_code: string | null;
          company_city: string | null;
          company_phone: string | null;
          company_email: string | null;
          company_website: string | null;
          logo_url: string | null;
          iban: string | null;
          qr_iban: string | null;
          mwst_enabled: boolean;
          mwst_rate: number;
          mwst_number: string | null;
          payment_terms_days: number;
          invoice_number_prefix: string;
          next_invoice_number: number;
          approval_required: boolean;
          billing_mode: 'advance' | 'arrears';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          company_name?: string | null;
          company_address?: string | null;
          company_postal_code?: string | null;
          company_city?: string | null;
          company_phone?: string | null;
          company_email?: string | null;
          company_website?: string | null;
          logo_url?: string | null;
          iban?: string | null;
          qr_iban?: string | null;
          mwst_enabled?: boolean;
          mwst_rate?: number;
          mwst_number?: string | null;
          payment_terms_days?: number;
          invoice_number_prefix?: string;
          next_invoice_number?: number;
          approval_required?: boolean;
          billing_mode?: 'advance' | 'arrears';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          company_name?: string | null;
          company_address?: string | null;
          company_postal_code?: string | null;
          company_city?: string | null;
          company_phone?: string | null;
          company_email?: string | null;
          company_website?: string | null;
          logo_url?: string | null;
          iban?: string | null;
          qr_iban?: string | null;
          mwst_enabled?: boolean;
          mwst_rate?: number;
          mwst_number?: string | null;
          payment_terms_days?: number;
          invoice_number_prefix?: string;
          next_invoice_number?: number;
          approval_required?: boolean;
          billing_mode?: 'advance' | 'arrears';
          created_at?: string;
          updated_at?: string;
        };
      };
      service_rates: {
        Row: {
          id: string;
          organization_id: string;
          activity_type: string;
          description: string | null;
          hourly_rate: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          activity_type: string;
          description?: string | null;
          hourly_rate: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          activity_type?: string;
          description?: string | null;
          hourly_rate?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      client_rate_overrides: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          activity_type: string;
          hourly_rate: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          activity_type: string;
          hourly_rate: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          activity_type?: string;
          hourly_rate?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      client_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          name: string;
          description: string | null;
          yearly_amount: number;
          interval: SubscriptionInterval;
          is_active: boolean;
          next_billing_date: string | null;
          contract_start_date: string | null;
          property_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          name: string;
          description?: string | null;
          yearly_amount: number;
          interval?: SubscriptionInterval;
          is_active?: boolean;
          next_billing_date?: string | null;
          contract_start_date?: string | null;
          property_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          name?: string;
          description?: string | null;
          yearly_amount?: number;
          interval?: SubscriptionInterval;
          is_active?: boolean;
          next_billing_date?: string | null;
          contract_start_date?: string | null;
          property_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          invoice_number: string;
          status: InvoiceStatus;
          issue_date: string;
          due_date: string;
          subtotal: number;
          mwst_rate: number;
          mwst_amount: number;
          total: number;
          pdf_url: string | null;
          notes: string | null;
          internal_notes: string | null;
          approved_by: string | null;
          approved_at: string | null;
          sent_at: string | null;
          sent_to_email: string | null;
          paid_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          invoice_number: string;
          status?: InvoiceStatus;
          issue_date?: string;
          due_date: string;
          subtotal?: number;
          mwst_rate?: number;
          mwst_amount?: number;
          total?: number;
          pdf_url?: string | null;
          notes?: string | null;
          internal_notes?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          sent_to_email?: string | null;
          paid_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          invoice_number?: string;
          status?: InvoiceStatus;
          issue_date?: string;
          due_date?: string;
          subtotal?: number;
          mwst_rate?: number;
          mwst_amount?: number;
          total?: number;
          pdf_url?: string | null;
          notes?: string | null;
          internal_notes?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          sent_to_email?: string | null;
          paid_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoice_line_items: {
        Row: {
          id: string;
          organization_id: string;
          invoice_id: string;
          line_type: InvoiceLineItemType;
          sort_order: number;
          description: string;
          quantity: number;
          unit: string;
          unit_price: number;
          total: number;
          subscription_id: string | null;
          period_start: string | null;
          period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invoice_id: string;
          line_type: InvoiceLineItemType;
          sort_order?: number;
          description: string;
          quantity?: number;
          unit?: string;
          unit_price?: number;
          total?: number;
          subscription_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          invoice_id?: string;
          line_type?: InvoiceLineItemType;
          sort_order?: number;
          description?: string;
          quantity?: number;
          unit?: string;
          unit_price?: number;
          total?: number;
          subscription_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoice_time_entries: {
        Row: {
          id: string;
          organization_id: string;
          invoice_line_item_id: string;
          time_entry_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invoice_line_item_id: string;
          time_entry_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          invoice_line_item_id?: string;
          time_entry_id?: string;
          created_at?: string;
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
      vacation_status: VacationStatus;
      invoice_status: InvoiceStatus;
      invoice_line_item_type: InvoiceLineItemType;
      subscription_interval: SubscriptionInterval;
    };
  };
}

// Convenience types
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type OrganizationInsert = Database['public']['Tables']['organizations']['Insert'];
export type OrganizationUpdate = Database['public']['Tables']['organizations']['Update'];
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
export type Client = Database['public']['Tables']['clients']['Row'];
export type RolePermission = Database['public']['Tables']['role_permissions']['Row'];
export type VacationRequest = Database['public']['Tables']['vacation_requests']['Row'];
export type OrganizationBillingSettings = Database['public']['Tables']['organization_billing_settings']['Row'];
export type ServiceRate = Database['public']['Tables']['service_rates']['Row'];
export type ClientRateOverride = Database['public']['Tables']['client_rate_overrides']['Row'];
export type ClientSubscription = Database['public']['Tables']['client_subscriptions']['Row'];
export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type InvoiceLineItem = Database['public']['Tables']['invoice_line_items']['Row'];
export type InvoiceTimeEntry = Database['public']['Tables']['invoice_time_entries']['Row'];

// Insert types
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type PropertyInsert = Database['public']['Tables']['properties']['Insert'];
export type WorkDayInsert = Database['public']['Tables']['work_days']['Insert'];
export type TimeEntryInsert = Database['public']['Tables']['time_entries']['Insert'];
export type ChecklistTemplateInsert = Database['public']['Tables']['checklist_templates']['Insert'];
export type IssueInsert = Database['public']['Tables']['issues']['Insert'];
export type AufgabeInsert = Database['public']['Tables']['aufgaben']['Insert'];
export type ChecklistItemCompletionInsert = Database['public']['Tables']['checklist_item_completions']['Insert'];
export type ClientInsert = Database['public']['Tables']['clients']['Insert'];
export type VacationRequestInsert = Database['public']['Tables']['vacation_requests']['Insert'];
export type OrganizationBillingSettingsInsert = Database['public']['Tables']['organization_billing_settings']['Insert'];
export type ServiceRateInsert = Database['public']['Tables']['service_rates']['Insert'];
export type ClientRateOverrideInsert = Database['public']['Tables']['client_rate_overrides']['Insert'];
export type ClientSubscriptionInsert = Database['public']['Tables']['client_subscriptions']['Insert'];
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
export type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert'];
export type InvoiceTimeEntryInsert = Database['public']['Tables']['invoice_time_entries']['Insert'];

// Update types
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type PropertyUpdate = Database['public']['Tables']['properties']['Update'];
export type WorkDayUpdate = Database['public']['Tables']['work_days']['Update'];
export type TimeEntryUpdate = Database['public']['Tables']['time_entries']['Update'];
export type ChecklistTemplateUpdate = Database['public']['Tables']['checklist_templates']['Update'];
export type IssueUpdate = Database['public']['Tables']['issues']['Update'];
export type AufgabeUpdate = Database['public']['Tables']['aufgaben']['Update'];
export type ClientUpdate = Database['public']['Tables']['clients']['Update'];
export type VacationRequestUpdate = Database['public']['Tables']['vacation_requests']['Update'];
export type OrganizationBillingSettingsUpdate = Database['public']['Tables']['organization_billing_settings']['Update'];
export type ServiceRateUpdate = Database['public']['Tables']['service_rates']['Update'];
export type ClientRateOverrideUpdate = Database['public']['Tables']['client_rate_overrides']['Update'];
export type ClientSubscriptionUpdate = Database['public']['Tables']['client_subscriptions']['Update'];
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];
export type InvoiceLineItemUpdate = Database['public']['Tables']['invoice_line_items']['Update'];
export type InvoiceTimeEntryUpdate = Database['public']['Tables']['invoice_time_entries']['Update'];

// Checklist item structure
export interface ChecklistItem {
  id: string;
  type: ChecklistItemType;
  label: string;
  required: boolean;
  order: number;
  translations?: Record<string, string>;
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

export interface PropertyWithClient extends Property {
  clients: Client | null;
}

export interface VacationRequestWithUser extends VacationRequest {
  user: Profile;
  reviewer: Profile | null;
}

export interface InvoiceWithClient extends Invoice {
  clients: Client;
}

export interface InvoiceWithDetails extends Invoice {
  clients: Client;
  invoice_line_items: InvoiceLineItem[];
  creator: Profile;
  approver: Profile | null;
}
