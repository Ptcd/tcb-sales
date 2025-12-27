export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      search_history: {
        Row: {
          created_at: string
          id: string
          keyword: string
          location: string
          result_count: number
          results_found: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword: string
          location: string
          result_count: number
          results_found: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword?: string
          location?: string
          result_count?: number
          results_found?: number
          user_id?: string
        }
        Relationships: []
      }
      search_results: {
        Row: {
          address: string
          created_at: string | null
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          place_id: string
          rating: number | null
          review_count: number | null
          search_history_id: string
          website: string | null
          lead_status: string
          assigned_to: string | null
          last_contacted_at: string | null
          updated_at: string | null
          jcc_sdr_first_touch_code: string | null
          jcc_sdr_last_touch_code: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          place_id: string
          rating?: number | null
          review_count?: number | null
          search_history_id: string
          website?: string | null
          lead_status?: string
          assigned_to?: string | null
          last_contacted_at?: string | null
          updated_at?: string | null
          jcc_sdr_first_touch_code?: string | null
          jcc_sdr_last_touch_code?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          review_count?: number | null
          search_history_id?: string
          website?: string | null
          lead_status?: string
          assigned_to?: string | null
          last_contacted_at?: string | null
          updated_at?: string | null
          jcc_sdr_first_touch_code?: string | null
          jcc_sdr_last_touch_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_results_search_history_id_fkey"
            columns: ["search_history_id"]
            isOneToOne: false
            referencedRelation: "recent_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_results_search_history_id_fkey"
            columns: ["search_history_id"]
            isOneToOne: false
            referencedRelation: "search_history"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          id: string
          lead_id: string
          user_id: string
          note: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          user_id: string
          note: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          user_id?: string
          note?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "search_results"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          id: string
          lead_id: string
          user_id: string
          activity_type: string
          activity_data: Json
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          user_id: string
          activity_type: string
          activity_data?: Json
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          user_id?: string
          activity_type?: string
          activity_data?: Json
          description?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "search_results"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          subject: string
          html_content: string
          text_content: string | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          subject: string
          html_content: string
          text_content?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          subject?: string
          html_content?: string
          text_content?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          template_id: string | null
          campaign_id: string | null
          to_email: string
          from_email: string
          subject: string
          html_content: string
          text_content: string | null
          status: string
          provider_message_id: string | null
          opened_at: string | null
          clicked_at: string | null
          bounced_at: string | null
          sent_at: string | null
          error_message: string | null
          lead_name: string | null
          lead_address: string | null
          template_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id?: string | null
          template_id?: string | null
          campaign_id?: string | null
          to_email: string
          from_email: string
          subject: string
          html_content: string
          text_content?: string | null
          status?: string
          provider_message_id?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          bounced_at?: string | null
          sent_at?: string | null
          error_message?: string | null
          lead_name?: string | null
          lead_address?: string | null
          template_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          template_id?: string | null
          campaign_id?: string | null
          to_email?: string
          from_email?: string
          subject?: string
          html_content?: string
          text_content?: string | null
          status?: string
          provider_message_id?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          bounced_at?: string | null
          sent_at?: string | null
          error_message?: string | null
          lead_name?: string | null
          lead_address?: string | null
          template_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "search_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_members: {
        Row: {
          id: string
          campaign_id: string
          user_id: string
          organization_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          user_id: string
          organization_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          user_id?: string
          organization_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          id: string
          campaign_id: string
          lead_id: string
          organization_id: string
          claimed_by: string | null
          claimed_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          lead_id: string
          organization_id: string
          claimed_by?: string | null
          claimed_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          lead_id?: string
          organization_id?: string
          claimed_by?: string | null
          claimed_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "search_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      recent_searches: {
        Row: {
          created_at: string | null
          id: string | null
          keyword: string | null
          location: string | null
          result_count: number | null
          results_found: number | null
          user_email: string | null
        }
        Relationships: []
      }
      user_search_results: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string | null
          keyword: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string | null
          phone: string | null
          place_id: string | null
          rating: number | null
          result_count: number | null
          review_count: number | null
          search_date: string | null
          search_history_id: string | null
          user_id: string | null
          website: string | null
          lead_status: string | null
          assigned_to: string | null
          last_contacted_at: string | null
          updated_at: string | null
          jcc_sdr_first_touch_code: string | null
          jcc_sdr_last_touch_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_results_search_history_id_fkey"
            columns: ["search_history_id"]
            isOneToOne: false
            referencedRelation: "recent_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_results_search_history_id_fkey"
            columns: ["search_history_id"]
            isOneToOne: false
            referencedRelation: "search_history"
            referencedColumns: ["id"]
          },
        ]
      }
      user_leads: {
        Row: {
          id: string | null
          search_history_id: string | null
          place_id: string | null
          name: string | null
          address: string | null
          phone: string | null
          email: string | null
          website: string | null
          rating: number | null
          review_count: number | null
          latitude: number | null
          longitude: number | null
          lead_status: string | null
          assigned_to: string | null
          last_contacted_at: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string | null
          keyword: string | null
          location: string | null
          result_count: number | null
          search_date: string | null
          notes_count: number | null
          activities_count: number | null
          jcc_sdr_first_touch_code: string | null
          jcc_sdr_last_touch_code: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_search_history: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_old_search_results: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_user_campaigns: {
        Args: Record<PropertyKey, never>
        Returns: { campaign_id: string }[]
      }
      is_user_in_campaign: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      get_lead_campaigns: {
        Args: { p_lead_id: string }
        Returns: { campaign_id: string; campaign_name: string; claimed_by: string | null }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
