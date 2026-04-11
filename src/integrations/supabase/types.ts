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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          checked_in: boolean
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          enrollment_id: string
          id: string
          lesson_date: string
          notes: string | null
          session_id: string
        }
        Insert: {
          checked_in?: boolean
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          lesson_date: string
          notes?: string | null
          session_id: string
        }
        Update: {
          checked_in?: boolean
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          lesson_date?: string
          notes?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "swim_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string
          phone: string | null
          source_page: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message: string
          phone?: string | null
          source_page?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string
          phone?: string | null
          source_page?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      dive_bookings: {
        Row: {
          course_name: string
          created_at: string
          email: string
          experience_level: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          preferred_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          course_name: string
          created_at?: string
          email: string
          experience_level?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          preferred_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          course_name?: string
          created_at?: string
          email?: string
          experience_level?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          preferred_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollment_agreements: {
        Row: {
          created_at: string
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          enrollment_id: string
          id: string
          photo_release_accepted: boolean
          privacy_policy_accepted: boolean
          privacy_policy_version: string
          signature_text: string
          signed_at: string
          signer_email: string
          signer_ip: string | null
          signer_name: string
          terms_accepted: boolean
          tos_version: string
          waiver_accepted: boolean
          waiver_version: string
        }
        Insert: {
          created_at?: string
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          enrollment_id: string
          id?: string
          photo_release_accepted?: boolean
          privacy_policy_accepted?: boolean
          privacy_policy_version?: string
          signature_text: string
          signed_at?: string
          signer_email: string
          signer_ip?: string | null
          signer_name: string
          terms_accepted?: boolean
          tos_version?: string
          waiver_accepted?: boolean
          waiver_version?: string
        }
        Update: {
          created_at?: string
          emergency_contact_name?: string
          emergency_contact_phone?: string
          emergency_contact_relationship?: string
          enrollment_id?: string
          id?: string
          photo_release_accepted?: boolean
          privacy_policy_accepted?: boolean
          privacy_policy_version?: string
          signature_text?: string
          signed_at?: string
          signer_email?: string
          signer_ip?: string | null
          signer_name?: string
          terms_accepted?: boolean
          tos_version?: string
          waiver_accepted?: boolean
          waiver_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_agreements_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "swim_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          availability: string[] | null
          available_start_date: string | null
          certifications: string[] | null
          created_at: string
          email: string
          experience_with_children: string | null
          first_name: string
          id: string
          is_archived: boolean
          is_viewed: boolean
          job_posting_id: string
          last_name: string
          phone: string
          resume_url: string | null
          status: string
          swimming_ability: string | null
          updated_at: string
        }
        Insert: {
          availability?: string[] | null
          available_start_date?: string | null
          certifications?: string[] | null
          created_at?: string
          email: string
          experience_with_children?: string | null
          first_name: string
          id?: string
          is_archived?: boolean
          is_viewed?: boolean
          job_posting_id: string
          last_name: string
          phone: string
          resume_url?: string | null
          status?: string
          swimming_ability?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string[] | null
          available_start_date?: string | null
          certifications?: string[] | null
          created_at?: string
          email?: string
          experience_with_children?: string | null
          first_name?: string
          id?: string
          is_archived?: boolean
          is_viewed?: boolean
          job_posting_id?: string
          last_name?: string
          phone?: string
          resume_url?: string | null
          status?: string
          swimming_ability?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          benefits: string[] | null
          contact_email: string | null
          created_at: string
          full_description: string
          id: string
          is_active: boolean
          job_type: string
          location: string
          pay_rate: string | null
          shift_schedule: string | null
          title: string
          updated_at: string
        }
        Insert: {
          benefits?: string[] | null
          contact_email?: string | null
          created_at?: string
          full_description: string
          id?: string
          is_active?: boolean
          job_type?: string
          location?: string
          pay_rate?: string | null
          shift_schedule?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          benefits?: string[] | null
          contact_email?: string | null
          created_at?: string
          full_description?: string
          id?: string
          is_active?: boolean
          job_type?: string
          location?: string
          pay_rate?: string | null
          shift_schedule?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lesson_requests: {
        Row: {
          child_age: number
          child_name: string
          created_at: string
          id: string
          lesson_type: string
          notes: string | null
          parent_email: string
          parent_name: string
          parent_phone: string | null
          preferred_times: string | null
          status: string
          updated_at: string
        }
        Insert: {
          child_age: number
          child_name: string
          created_at?: string
          id?: string
          lesson_type?: string
          notes?: string | null
          parent_email: string
          parent_name: string
          parent_phone?: string | null
          preferred_times?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          child_age?: number
          child_name?: string
          created_at?: string
          id?: string
          lesson_type?: string
          notes?: string | null
          parent_email?: string
          parent_name?: string
          parent_phone?: string | null
          preferred_times?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pool_events: {
        Row: {
          client_name: string | null
          created_at: string
          end_time: string
          event_date: string
          event_type: string
          id: string
          instructor_name: string | null
          is_recurring: boolean
          notes: string | null
          pool_area: string
          recurrence_day: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          end_time: string
          event_date: string
          event_type: string
          id?: string
          instructor_name?: string | null
          is_recurring?: boolean
          notes?: string | null
          pool_area?: string
          recurrence_day?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          end_time?: string
          event_date?: string
          event_type?: string
          id?: string
          instructor_name?: string | null
          is_recurring?: boolean
          notes?: string | null
          pool_area?: string
          recurrence_day?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_lesson_dates: {
        Row: {
          cancel_reason: string | null
          created_at: string
          id: string
          is_cancelled: boolean
          lesson_date: string
          session_id: string
        }
        Insert: {
          cancel_reason?: string | null
          created_at?: string
          id?: string
          is_cancelled?: boolean
          lesson_date: string
          session_id: string
        }
        Update: {
          cancel_reason?: string | null
          created_at?: string
          id?: string
          is_cancelled?: boolean
          lesson_date?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_lesson_dates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      swim_enrollments: {
        Row: {
          child_age: number
          child_dob: string | null
          child_name: string
          created_at: string
          id: string
          is_first_time: boolean
          lesson_type: string
          medical_notes: string | null
          notes: string | null
          parent_email: string
          parent_name: string
          parent_phone: string | null
          payment_amount: number | null
          payment_due_date: string | null
          payment_reminder_sent_at: string | null
          payment_status: string
          registration_fee: number | null
          session_id: string | null
          status: string
          stripe_payment_id: string | null
          swim_level: string
          updated_at: string
        }
        Insert: {
          child_age: number
          child_dob?: string | null
          child_name: string
          created_at?: string
          id?: string
          is_first_time?: boolean
          lesson_type?: string
          medical_notes?: string | null
          notes?: string | null
          parent_email: string
          parent_name: string
          parent_phone?: string | null
          payment_amount?: number | null
          payment_due_date?: string | null
          payment_reminder_sent_at?: string | null
          payment_status?: string
          registration_fee?: number | null
          session_id?: string | null
          status?: string
          stripe_payment_id?: string | null
          swim_level: string
          updated_at?: string
        }
        Update: {
          child_age?: number
          child_dob?: string | null
          child_name?: string
          created_at?: string
          id?: string
          is_first_time?: boolean
          lesson_type?: string
          medical_notes?: string | null
          notes?: string | null
          parent_email?: string
          parent_name?: string
          parent_phone?: string | null
          payment_amount?: number | null
          payment_due_date?: string | null
          payment_reminder_sent_at?: string | null
          payment_status?: string
          registration_fee?: number | null
          session_id?: string | null
          status?: string
          stripe_payment_id?: string | null
          swim_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swim_enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      swim_sessions: {
        Row: {
          age_group: string | null
          created_at: string
          day_of_week: string
          end_time: string
          id: string
          instructor_id: string | null
          is_active: boolean
          max_students: number
          price_per_lesson: number | null
          registration_status: string
          session_end_date: string | null
          session_name: string | null
          session_period_id: string | null
          session_price: number | null
          session_start_date: string | null
          start_time: string
          swim_level: string
          total_lessons: number | null
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          created_at?: string
          day_of_week: string
          end_time: string
          id?: string
          instructor_id?: string | null
          is_active?: boolean
          max_students?: number
          price_per_lesson?: number | null
          registration_status?: string
          session_end_date?: string | null
          session_name?: string | null
          session_period_id?: string | null
          session_price?: number | null
          session_start_date?: string | null
          start_time: string
          swim_level: string
          total_lessons?: number | null
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          created_at?: string
          day_of_week?: string
          end_time?: string
          id?: string
          instructor_id?: string | null
          is_active?: boolean
          max_students?: number
          price_per_lesson?: number | null
          registration_status?: string
          session_end_date?: string | null
          session_name?: string | null
          session_period_id?: string | null
          session_price?: number | null
          session_start_date?: string | null
          start_time?: string
          swim_level?: string
          total_lessons?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swim_sessions_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swim_sessions_session_period_id_fkey"
            columns: ["session_period_id"]
            isOneToOne: false
            referencedRelation: "session_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_reservations: {
        Row: {
          certification_level: string | null
          created_at: string
          destination: string
          email: string
          full_name: string
          id: string
          notes: string | null
          number_of_divers: number
          phone: string | null
          status: string
          trip_dates: string
          updated_at: string
        }
        Insert: {
          certification_level?: string | null
          created_at?: string
          destination: string
          email: string
          full_name: string
          id?: string
          notes?: string | null
          number_of_divers?: number
          phone?: string | null
          status?: string
          trip_dates: string
          updated_at?: string
        }
        Update: {
          certification_level?: string | null
          created_at?: string
          destination?: string
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          number_of_divers?: number
          phone?: string | null
          status?: string
          trip_dates?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
