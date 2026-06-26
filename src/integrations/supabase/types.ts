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
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          instructor_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          instructor_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          instructor_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          pinned: boolean
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      client_credits: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          parent_email: string
          source: string
          source_ref: string | null
          used_against: string | null
          used_at: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          parent_email: string
          source: string
          source_ref?: string | null
          used_against?: string | null
          used_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          parent_email?: string
          source?: string
          source_ref?: string | null
          used_against?: string | null
          used_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: []
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enrollment_agreements: {
        Row: {
          created_at: string
          emergency_contact_first_name: string | null
          emergency_contact_last_name: string | null
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          enrollment_id: string | null
          id: string
          lesson_booking_id: string | null
          photo_release_accepted: boolean
          privacy_policy_accepted: boolean
          privacy_policy_version: string
          signature_text: string
          signed_at: string
          signer_email: string
          signer_first_name: string | null
          signer_ip: string | null
          signer_last_name: string | null
          signer_name: string
          terms_accepted: boolean
          tos_version: string
          waiver_accepted: boolean
          waiver_version: string
        }
        Insert: {
          created_at?: string
          emergency_contact_first_name?: string | null
          emergency_contact_last_name?: string | null
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          enrollment_id?: string | null
          id?: string
          lesson_booking_id?: string | null
          photo_release_accepted?: boolean
          privacy_policy_accepted?: boolean
          privacy_policy_version?: string
          signature_text: string
          signed_at?: string
          signer_email: string
          signer_first_name?: string | null
          signer_ip?: string | null
          signer_last_name?: string | null
          signer_name: string
          terms_accepted?: boolean
          tos_version?: string
          waiver_accepted?: boolean
          waiver_version?: string
        }
        Update: {
          created_at?: string
          emergency_contact_first_name?: string | null
          emergency_contact_last_name?: string | null
          emergency_contact_name?: string
          emergency_contact_phone?: string
          emergency_contact_relationship?: string
          enrollment_id?: string | null
          id?: string
          lesson_booking_id?: string | null
          photo_release_accepted?: boolean
          privacy_policy_accepted?: boolean
          privacy_policy_version?: string
          signature_text?: string
          signed_at?: string
          signer_email?: string
          signer_first_name?: string | null
          signer_ip?: string | null
          signer_last_name?: string | null
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
      enrollment_date_moves: {
        Row: {
          created_at: string
          created_by: string | null
          enrollment_id: string
          id: string
          lesson_date: string
          reason: string | null
          target_session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enrollment_id: string
          id?: string
          lesson_date: string
          reason?: string | null
          target_session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enrollment_id?: string
          id?: string
          lesson_date?: string
          reason?: string | null
          target_session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_date_moves_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "swim_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_date_moves_target_session_id_fkey"
            columns: ["target_session_id"]
            isOneToOne: false
            referencedRelation: "swim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          instructor_id: string
          notes: string | null
          preference: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          instructor_id: string
          notes?: string | null
          preference?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          instructor_id?: string
          notes?: string | null
          preference?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      instructor_booking_blocks: {
        Row: {
          break_end_time: string | null
          break_start_time: string | null
          created_at: string
          day_of_week: number | null
          default_lesson_type: string
          end_date: string | null
          end_time: string
          id: string
          instructor_id: string
          is_blackout: boolean
          kind: string
          notes: string | null
          pool_area: string
          slot_minutes: number
          start_date: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          break_end_time?: string | null
          break_start_time?: string | null
          created_at?: string
          day_of_week?: number | null
          default_lesson_type?: string
          end_date?: string | null
          end_time: string
          id?: string
          instructor_id: string
          is_blackout?: boolean
          kind: string
          notes?: string | null
          pool_area?: string
          slot_minutes?: number
          start_date?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          break_end_time?: string | null
          break_start_time?: string | null
          created_at?: string
          day_of_week?: number | null
          default_lesson_type?: string
          end_date?: string | null
          end_time?: string
          id?: string
          instructor_id?: string
          is_blackout?: boolean
          kind?: string
          notes?: string | null
          pool_area?: string
          slot_minutes?: number
          start_date?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_booking_blocks_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          created_at: string
          email: string | null
          hourly_wage: number | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          hourly_wage?: number | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          hourly_wage?: number | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      internal_comments: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          target_key: string
          target_type: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id?: string
          target_key: string
          target_type: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          target_key?: string
          target_type?: string
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
      lesson_booking_occurrences: {
        Row: {
          booking_id: string
          cancel_reason: string | null
          cancel_token: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          charge_attempted_at: string | null
          charge_error: string | null
          charge_status: string
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          end_time_override: string | null
          id: string
          instructor_override_id: string | null
          instructor_override_name: string | null
          occurrence_date: string
          paid_at: string | null
          payment_link_email_error: string | null
          payment_link_email_status: string | null
          payment_link_sent_at: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          pool_event_id: string | null
          reminder_attempted_at: string | null
          start_time_override: string | null
          status: string
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          cancel_reason?: string | null
          cancel_token?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          charge_attempted_at?: string | null
          charge_error?: string | null
          charge_status?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          end_time_override?: string | null
          id?: string
          instructor_override_id?: string | null
          instructor_override_name?: string | null
          occurrence_date: string
          paid_at?: string | null
          payment_link_email_error?: string | null
          payment_link_email_status?: string | null
          payment_link_sent_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          pool_event_id?: string | null
          reminder_attempted_at?: string | null
          start_time_override?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          cancel_reason?: string | null
          cancel_token?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          charge_attempted_at?: string | null
          charge_error?: string | null
          charge_status?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          end_time_override?: string | null
          id?: string
          instructor_override_id?: string | null
          instructor_override_name?: string | null
          occurrence_date?: string
          paid_at?: string | null
          payment_link_email_error?: string | null
          payment_link_email_status?: string | null
          payment_link_sent_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          pool_event_id?: string | null
          reminder_attempted_at?: string | null
          start_time_override?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_booking_occurrences_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "lesson_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_booking_occurrences_instructor_override_id_fkey"
            columns: ["instructor_override_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_booking_occurrences_pool_event_id_fkey"
            columns: ["pool_event_id"]
            isOneToOne: false
            referencedRelation: "pool_events"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_bookings: {
        Row: {
          booking_source: string
          cancellation_policy_hours: number
          child_age: number | null
          child_dob: string | null
          child_first_name: string | null
          child_last_name: string | null
          child_name: string | null
          confirmation_email_error: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_status: string | null
          created_at: string
          end_time: string
          frequency: string | null
          id: string
          instructor_id: string | null
          instructor_name: string | null
          lesson_type: string
          notes: string | null
          parent_email: string
          parent_first_name: string | null
          parent_last_name: string | null
          parent_name: string
          parent_phone: string | null
          partner_parent_email: string | null
          partner_parent_name: string | null
          partner_parent_phone: string | null
          partner_swimmer_first_name: string | null
          partner_swimmer_last_name: string | null
          pool_area: string
          price_per_session: number
          recur_days: string[] | null
          recurring: boolean
          series_end: string | null
          series_start: string
          sms_consent: boolean
          sms_consent_at: string | null
          sms_consent_ip: string | null
          sms_consent_text: string | null
          sms_consent_version: string | null
          start_time: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          updated_at: string
          waiver_signed_at: string | null
          waiver_token: string | null
        }
        Insert: {
          booking_source?: string
          cancellation_policy_hours?: number
          child_age?: number | null
          child_dob?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name?: string | null
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string | null
          created_at?: string
          end_time: string
          frequency?: string | null
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          lesson_type: string
          notes?: string | null
          parent_email: string
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name: string
          parent_phone?: string | null
          partner_parent_email?: string | null
          partner_parent_name?: string | null
          partner_parent_phone?: string | null
          partner_swimmer_first_name?: string | null
          partner_swimmer_last_name?: string | null
          pool_area?: string
          price_per_session?: number
          recur_days?: string[] | null
          recurring?: boolean
          series_end?: string | null
          series_start: string
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_text?: string | null
          sms_consent_version?: string | null
          start_time: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
          waiver_signed_at?: string | null
          waiver_token?: string | null
        }
        Update: {
          booking_source?: string
          cancellation_policy_hours?: number
          child_age?: number | null
          child_dob?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name?: string | null
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string | null
          created_at?: string
          end_time?: string
          frequency?: string | null
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          lesson_type?: string
          notes?: string | null
          parent_email?: string
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name?: string
          parent_phone?: string | null
          partner_parent_email?: string | null
          partner_parent_name?: string | null
          partner_parent_phone?: string | null
          partner_swimmer_first_name?: string | null
          partner_swimmer_last_name?: string | null
          pool_area?: string
          price_per_session?: number
          recur_days?: string[] | null
          recurring?: boolean
          series_end?: string | null
          series_start?: string
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_text?: string | null
          sms_consent_version?: string | null
          start_time?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
          waiver_signed_at?: string | null
          waiver_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_bookings_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_requests: {
        Row: {
          child_age: number
          child_dob: string | null
          child_first_name: string | null
          child_last_name: string | null
          child_name: string
          created_at: string
          id: string
          is_adult_swimmer: boolean
          last_replied_at: string | null
          last_reply_message: string | null
          lesson_type: string
          notes: string | null
          parent_email: string
          parent_first_name: string | null
          parent_last_name: string | null
          parent_name: string
          parent_phone: string | null
          preferred_times: string | null
          status: string
          updated_at: string
        }
        Insert: {
          child_age: number
          child_dob?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name: string
          created_at?: string
          id?: string
          is_adult_swimmer?: boolean
          last_replied_at?: string | null
          last_reply_message?: string | null
          lesson_type?: string
          notes?: string | null
          parent_email: string
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name: string
          parent_phone?: string | null
          preferred_times?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          child_age?: number
          child_dob?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name?: string
          created_at?: string
          id?: string
          is_adult_swimmer?: boolean
          last_replied_at?: string | null
          last_reply_message?: string | null
          lesson_type?: string
          notes?: string | null
          parent_email?: string
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name?: string
          parent_phone?: string | null
          preferred_times?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaign_recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          contact_id: string | null
          created_at: string
          email: string
          error: string | null
          id: string
          opened_at: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          email: string
          error?: string | null
          id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          audience: Json
          body_blocks: Json
          body_html: string | null
          clicked_count: number
          created_at: string
          created_by: string | null
          error: string | null
          failed_count: number
          from_address: string | null
          id: string
          name: string
          opened_count: number
          preheader: string | null
          reply_to: string | null
          scheduled_for: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          body_blocks?: Json
          body_html?: string | null
          clicked_count?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed_count?: number
          from_address?: string | null
          id?: string
          name: string
          opened_count?: number
          preheader?: string | null
          reply_to?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          body_blocks?: Json
          body_html?: string | null
          clicked_count?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed_count?: number
          from_address?: string | null
          id?: string
          name?: string
          opened_count?: number
          preheader?: string | null
          reply_to?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_contacts: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          last_sent_at: string | null
          notes: string | null
          phone: string | null
          source: string
          subscribed: boolean
          tags: string[]
          unsubscribe_reason: string | null
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_sent_at?: string | null
          notes?: string | null
          phone?: string | null
          source?: string
          subscribed?: boolean
          tags?: string[]
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_sent_at?: string | null
          notes?: string | null
          phone?: string | null
          source?: string
          subscribed?: boolean
          tags?: string[]
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      payment_reconciliation_alerts: {
        Row: {
          actual_amount: number
          created_at: string
          customer_email: string | null
          delta: number
          direction: string
          enrollment_ids: string[] | null
          expected_amount: number
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          stripe_checkout_session_id: string
        }
        Insert: {
          actual_amount: number
          created_at?: string
          customer_email?: string | null
          delta: number
          direction: string
          enrollment_ids?: string[] | null
          expected_amount: number
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stripe_checkout_session_id: string
        }
        Update: {
          actual_amount?: number
          created_at?: string
          customer_email?: string | null
          delta?: number
          direction?: string
          enrollment_ids?: string[] | null
          expected_amount?: number
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stripe_checkout_session_id?: string
        }
        Relationships: []
      }
      pending_enrollments: {
        Row: {
          created_at: string
          customer_email: string
          id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          customer_email: string
          id?: string
          payload: Json
        }
        Update: {
          created_at?: string
          customer_email?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      pool_events: {
        Row: {
          client_first_name: string | null
          client_last_name: string | null
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
          client_first_name?: string | null
          client_last_name?: string | null
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
          client_first_name?: string | null
          client_last_name?: string | null
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
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          stripe_customer_id: string | null
          stripe_default_pm_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          stripe_default_pm_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          stripe_default_pm_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string
          enrollment_id: string | null
          error: string | null
          id: string
          lesson_occurrence_id: string | null
          message: string | null
          phone: string | null
          reminder_kind: string
          scheduled_at: string
          sent_at: string | null
          session_lesson_date_id: string | null
          status: string
          swimmer_name: string | null
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string
          enrollment_id?: string | null
          error?: string | null
          id?: string
          lesson_occurrence_id?: string | null
          message?: string | null
          phone?: string | null
          reminder_kind: string
          scheduled_at?: string
          sent_at?: string | null
          session_lesson_date_id?: string | null
          status: string
          swimmer_name?: string | null
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string
          enrollment_id?: string | null
          error?: string | null
          id?: string
          lesson_occurrence_id?: string | null
          message?: string | null
          phone?: string | null
          reminder_kind?: string
          scheduled_at?: string
          sent_at?: string | null
          session_lesson_date_id?: string | null
          status?: string
          swimmer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "lesson_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "swim_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_logs_lesson_occurrence_id_fkey"
            columns: ["lesson_occurrence_id"]
            isOneToOne: false
            referencedRelation: "lesson_booking_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_logs_session_lesson_date_id_fkey"
            columns: ["session_lesson_date_id"]
            isOneToOne: false
            referencedRelation: "session_lesson_dates"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_level_audiences: {
        Row: {
          created_at: string
          level: string
          resend_audience_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          level: string
          resend_audience_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          level?: string
          resend_audience_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_publications: {
        Row: {
          id: string
          published_at: string
          published_by: string | null
          week_start: string
        }
        Insert: {
          id?: string
          published_at?: string
          published_by?: string | null
          week_start: string
        }
        Update: {
          id?: string
          published_at?: string
          published_by?: string | null
          week_start?: string
        }
        Relationships: []
      }
      session_lesson_dates: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          instructor_override_id: string | null
          is_cancelled: boolean
          lesson_date: string
          session_id: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          instructor_override_id?: string | null
          is_cancelled?: boolean
          lesson_date: string
          session_id: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          instructor_override_id?: string | null
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
          resend_audience_id: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          resend_audience_id?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          resend_audience_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_positions: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_trade_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          from_instructor_id: string
          id: string
          message: string | null
          responded_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: string
          status: string
          to_instructor_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          from_instructor_id: string
          id?: string
          message?: string | null
          responded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id: string
          status?: string
          to_instructor_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          from_instructor_id?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: string
          status?: string
          to_instructor_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          instructor_id: string | null
          notes: string | null
          position_id: string | null
          shift_date: string
          start_time: string
          status: string
          swim_session_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          instructor_id?: string | null
          notes?: string | null
          position_id?: string | null
          shift_date: string
          start_time: string
          status?: string
          swim_session_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          instructor_id?: string | null
          notes?: string | null
          position_id?: string | null
          shift_date?: string
          start_time?: string
          status?: string
          swim_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "shift_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_swim_session_id_fkey"
            columns: ["swim_session_id"]
            isOneToOne: false
            referencedRelation: "swim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_holds: {
        Row: {
          created_at: string
          end_time: string
          held_until: string
          id: string
          instructor_id: string
          session_token: string
          slot_date: string
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          held_until?: string
          id?: string
          instructor_id: string
          session_token: string
          slot_date: string
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          held_until?: string
          id?: string
          instructor_id?: string
          session_token?: string
          slot_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_holds_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          created_at: string
          id: string
          last_direction: string | null
          last_message_at: string | null
          last_message_preview: string | null
          parent_name: string | null
          parent_phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          parent_name?: string | null
          parent_phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          parent_name?: string | null
          parent_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          sent_by: string | null
          status: string
          textmagic_message_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          sent_by?: string | null
          status: string
          textmagic_message_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          sent_by?: string | null
          status?: string
          textmagic_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      swim_enrollments: {
        Row: {
          child_age: number
          child_dob: string | null
          child_first_name: string | null
          child_last_name: string | null
          child_name: string
          created_at: string
          id: string
          is_first_time: boolean
          lesson_type: string
          medical_notes: string | null
          notes: string | null
          parent_email: string
          parent_first_name: string | null
          parent_last_name: string | null
          parent_name: string
          parent_phone: string | null
          payment_amount: number | null
          payment_due_date: string | null
          payment_method: string
          payment_reference: string | null
          payment_reminder_sent_at: string | null
          payment_status: string
          reg_fee_link_sent_at: string | null
          registration_fee: number | null
          session_fee_paid_at: string | null
          session_fee_payment_link_id: string | null
          session_fee_payment_link_url: string | null
          session_fee_refund_amount: number | null
          session_fee_refund_at: string | null
          session_fee_refund_reason: string | null
          session_fee_refund_stripe_id: string | null
          session_fee_status: string
          session_fee_stripe_id: string | null
          session_id: string | null
          session_welcome_sent_at: string | null
          sms_consent: boolean
          sms_consent_at: string | null
          sms_consent_ip: string | null
          sms_consent_text: string | null
          sms_consent_version: string | null
          status: string
          stripe_payment_id: string | null
          swim_level: string
          updated_at: string
          waiver_signed_at: string | null
          waiver_token: string | null
        }
        Insert: {
          child_age: number
          child_dob?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name: string
          created_at?: string
          id?: string
          is_first_time?: boolean
          lesson_type?: string
          medical_notes?: string | null
          notes?: string | null
          parent_email: string
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name: string
          parent_phone?: string | null
          payment_amount?: number | null
          payment_due_date?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_reminder_sent_at?: string | null
          payment_status?: string
          reg_fee_link_sent_at?: string | null
          registration_fee?: number | null
          session_fee_paid_at?: string | null
          session_fee_payment_link_id?: string | null
          session_fee_payment_link_url?: string | null
          session_fee_refund_amount?: number | null
          session_fee_refund_at?: string | null
          session_fee_refund_reason?: string | null
          session_fee_refund_stripe_id?: string | null
          session_fee_status?: string
          session_fee_stripe_id?: string | null
          session_id?: string | null
          session_welcome_sent_at?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_text?: string | null
          sms_consent_version?: string | null
          status?: string
          stripe_payment_id?: string | null
          swim_level: string
          updated_at?: string
          waiver_signed_at?: string | null
          waiver_token?: string | null
        }
        Update: {
          child_age?: number
          child_dob?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name?: string
          created_at?: string
          id?: string
          is_first_time?: boolean
          lesson_type?: string
          medical_notes?: string | null
          notes?: string | null
          parent_email?: string
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name?: string
          parent_phone?: string | null
          payment_amount?: number | null
          payment_due_date?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_reminder_sent_at?: string | null
          payment_status?: string
          reg_fee_link_sent_at?: string | null
          registration_fee?: number | null
          session_fee_paid_at?: string | null
          session_fee_payment_link_id?: string | null
          session_fee_payment_link_url?: string | null
          session_fee_refund_amount?: number | null
          session_fee_refund_at?: string | null
          session_fee_refund_reason?: string | null
          session_fee_refund_stripe_id?: string | null
          session_fee_status?: string
          session_fee_stripe_id?: string | null
          session_id?: string | null
          session_welcome_sent_at?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_text?: string | null
          sms_consent_version?: string | null
          status?: string
          stripe_payment_id?: string | null
          swim_level?: string
          updated_at?: string
          waiver_signed_at?: string | null
          waiver_token?: string | null
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
          resend_audience_id: string | null
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
          resend_audience_id?: string | null
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
          resend_audience_id?: string | null
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
          {
            foreignKeyName: "swim_sessions_session_period_id_fkey"
            columns: ["session_period_id"]
            isOneToOne: false
            referencedRelation: "session_periods_public"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number
          clock_in_at: string
          clock_out_at: string | null
          created_at: string
          edited_by: string | null
          id: string
          instructor_id: string
          notes: string | null
          shift_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          edited_by?: string | null
          id?: string
          instructor_id: string
          notes?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          edited_by?: string | null
          id?: string
          instructor_id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_off_requests: {
        Row: {
          admin_notes: string | null
          all_day: boolean
          created_at: string
          end_date: string
          end_time: string | null
          id: string
          instructor_id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          all_day?: boolean
          created_at?: string
          end_date: string
          end_time?: string | null
          id?: string
          instructor_id: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          all_day?: boolean
          created_at?: string
          end_date?: string
          end_time?: string | null
          id?: string
          instructor_id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      visitor_waiver_links: {
        Row: {
          created_at: string
          enrollment_id: string | null
          id: string
          lesson_booking_id: string | null
          matched_by: string
          swimmer_name: string
          visitor_waiver_id: string
        }
        Insert: {
          created_at?: string
          enrollment_id?: string | null
          id?: string
          lesson_booking_id?: string | null
          matched_by?: string
          swimmer_name: string
          visitor_waiver_id: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string | null
          id?: string
          lesson_booking_id?: string | null
          matched_by?: string
          swimmer_name?: string
          visitor_waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_waiver_links_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "swim_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_waiver_links_lesson_booking_id_fkey"
            columns: ["lesson_booking_id"]
            isOneToOne: false
            referencedRelation: "lesson_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_waiver_links_visitor_waiver_id_fkey"
            columns: ["visitor_waiver_id"]
            isOneToOne: false
            referencedRelation: "visitor_waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_waivers: {
        Row: {
          completed_by_staff_id: string | null
          created_at: string
          email_sent_at: string | null
          emergency_contact_first_name: string | null
          emergency_contact_last_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          photo_release_accepted: boolean
          privacy_policy_accepted: boolean
          privacy_policy_version: string
          signature_text: string
          signed_at: string
          signer_email: string
          signer_first_name: string
          signer_ip: string | null
          signer_last_name: string
          signer_phone: string | null
          source: string
          swimmers: Json
          terms_accepted: boolean
          tos_version: string
          waiver_accepted: boolean
          waiver_version: string
        }
        Insert: {
          completed_by_staff_id?: string | null
          created_at?: string
          email_sent_at?: string | null
          emergency_contact_first_name?: string | null
          emergency_contact_last_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          photo_release_accepted?: boolean
          privacy_policy_accepted?: boolean
          privacy_policy_version?: string
          signature_text: string
          signed_at?: string
          signer_email: string
          signer_first_name: string
          signer_ip?: string | null
          signer_last_name: string
          signer_phone?: string | null
          source?: string
          swimmers?: Json
          terms_accepted?: boolean
          tos_version?: string
          waiver_accepted?: boolean
          waiver_version?: string
        }
        Update: {
          completed_by_staff_id?: string | null
          created_at?: string
          email_sent_at?: string | null
          emergency_contact_first_name?: string | null
          emergency_contact_last_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          photo_release_accepted?: boolean
          privacy_policy_accepted?: boolean
          privacy_policy_version?: string
          signature_text?: string
          signed_at?: string
          signer_email?: string
          signer_first_name?: string
          signer_ip?: string | null
          signer_last_name?: string
          signer_phone?: string | null
          source?: string
          swimmers?: Json
          terms_accepted?: boolean
          tos_version?: string
          waiver_accepted?: boolean
          waiver_version?: string
        }
        Relationships: []
      }
      waitlist_requests: {
        Row: {
          booking_id: string | null
          child_age: number | null
          child_first_name: string
          child_last_name: string
          created_at: string
          id: string
          lesson_type: string
          notes: string | null
          offer_expires_at: string | null
          offered_at: string | null
          parent_email: string
          parent_first_name: string
          parent_last_name: string
          parent_phone: string | null
          session_id: string | null
          source_page: string | null
          status: string
          swim_level: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          child_age?: number | null
          child_first_name: string
          child_last_name: string
          created_at?: string
          id?: string
          lesson_type?: string
          notes?: string | null
          offer_expires_at?: string | null
          offered_at?: string | null
          parent_email: string
          parent_first_name: string
          parent_last_name: string
          parent_phone?: string | null
          session_id?: string | null
          source_page?: string | null
          status?: string
          swim_level?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          child_age?: number | null
          child_first_name?: string
          child_last_name?: string
          created_at?: string
          id?: string
          lesson_type?: string
          notes?: string | null
          offer_expires_at?: string | null
          offered_at?: string | null
          parent_email?: string
          parent_first_name?: string
          parent_last_name?: string
          parent_phone?: string | null
          session_id?: string | null
          source_page?: string | null
          status?: string
          swim_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "lesson_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      session_periods_public: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_link_visitor_waiver: {
        Args: {
          _enrollment_id?: string
          _lesson_booking_id?: string
          _waiver_id: string
        }
        Returns: string
      }
      admin_search_link_targets: {
        Args: { _q: string }
        Returns: {
          child_name: string
          detail: string
          kind: string
          parent_email: string
          parent_name: string
          target_id: string
        }[]
      }
      admin_unlink_visitor_waiver: {
        Args: {
          _enrollment_id?: string
          _lesson_booking_id?: string
          _waiver_id: string
        }
        Returns: number
      }
      approve_shift_trade: {
        Args: { _trade_id: string }
        Returns: {
          admin_notes: string | null
          created_at: string
          from_instructor_id: string
          id: string
          message: string | null
          responded_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: string
          status: string
          to_instructor_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shift_trade_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bookings_waiver_status: {
        Args: { _ids: string[] }
        Returns: {
          booking_id: string
          has_waiver: boolean
        }[]
      }
      check_session_periods_public_access: { Args: never; Returns: Json }
      claim_open_shift: {
        Args: { _shift_id: string }
        Returns: {
          color: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          instructor_id: string | null
          notes: string | null
          position_id: string | null
          shift_date: string
          start_time: string
          status: string
          swim_session_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clock_in: {
        Args: { _notes?: string; _shift_id?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number
          clock_in_at: string
          clock_out_at: string | null
          created_at: string
          edited_by: string | null
          id: string
          instructor_id: string
          notes: string | null
          shift_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "time_clock_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clock_out: {
        Args: { _break_minutes?: number; _notes?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number
          clock_in_at: string
          clock_out_at: string | null
          created_at: string
          edited_by: string | null
          id: string
          instructor_id: string
          notes: string | null
          shift_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "time_clock_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_instructor_id: { Args: never; Returns: string }
      daitch_mokotoff: { Args: { "": string }; Returns: string[] }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dmetaphone: { Args: { "": string }; Returns: string }
      dmetaphone_alt: { Args: { "": string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enrollments_waiver_status: {
        Args: { _ids: string[] }
        Returns: {
          enrollment_id: string
          has_waiver: boolean
        }[]
      }
      get_active_instructors_public: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          name: string
        }[]
      }
      get_active_slot_holds: {
        Args: {
          p_from_date: string
          p_session_token?: string
          p_to_date: string
        }
        Returns: {
          instructor_id: string
          slot_date: string
          start_time: string
        }[]
      }
      get_active_waiver_for_swimmer: {
        Args: { _dob: string; _first: string; _last: string }
        Returns: {
          emergency_contact_first_name: string
          emergency_contact_last_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          photo_release_accepted: boolean
          signature_text: string
          signed_at: string
          signer_email: string
          signer_first_name: string
          signer_last_name: string
          waiver_id: string
        }[]
      }
      get_active_waiver_signed_at_for_swimmer: {
        Args: { _dob: string; _first: string; _last: string }
        Returns: string
      }
      get_email_by_unsubscribe_token: {
        Args: { _token: string }
        Returns: string
      }
      get_instructor_wages: {
        Args: never
        Returns: {
          hourly_wage: number
          id: string
        }[]
      }
      get_instructors_admin: {
        Args: never
        Returns: {
          created_at: string
          email: string
          hourly_wage: number
          id: string
          is_active: boolean
          name: string
          phone: string
          updated_at: string
          user_id: string
        }[]
      }
      get_lesson_booking_by_waiver_token: {
        Args: { _token: string }
        Returns: {
          child_name: string
          id: string
          lesson_type: string
          parent_email: string
          parent_name: string
          waiver_signed_at: string
        }[]
      }
      get_lesson_booking_summary_by_token: {
        Args: { _token: string }
        Returns: {
          child_name: string
          end_time: string
          id: string
          instructor_name: string
          lesson_type: string
          next_checkout_url: string
          next_occurrence_date: string
          next_payment_status: string
          parent_email: string
          parent_name: string
          recurring: boolean
          series_end: string
          series_start: string
          start_time: string
          waiver_signed_at: string
        }[]
      }
      get_occurrence_by_cancel_token: {
        Args: { _token: string }
        Returns: {
          auto_charge_status: string
          booking_id: string
          cancellation_policy_hours: number
          child_name: string
          end_time: string
          id: string
          instructor_name: string
          occurrence_date: string
          parent_email: string
          parent_name: string
          payment_status: string
          start_time: string
          status: string
        }[]
      }
      get_or_create_unsubscribe_token: {
        Args: { _email: string }
        Returns: string
      }
      get_public_booking_blocks: {
        Args: { _instructor_ids?: string[] }
        Returns: {
          break_end_time: string | null
          break_start_time: string | null
          created_at: string
          day_of_week: number | null
          default_lesson_type: string
          end_date: string | null
          end_time: string
          id: string
          instructor_id: string
          is_blackout: boolean
          kind: string
          notes: string | null
          pool_area: string
          slot_minutes: number
          start_date: string | null
          start_time: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "instructor_booking_blocks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_taken_occurrences: {
        Args: { p_from_date: string; p_to_date: string }
        Returns: {
          end_time: string
          instructor_id: string
          occurrence_date: string
          start_time: string
        }[]
      }
      get_resend_audience_mappings: { Args: never; Returns: Json }
      get_returning_family_by_email: { Args: { _email: string }; Returns: Json }
      get_session_enrollment_counts: {
        Args: { _session_ids: string[] }
        Returns: {
          enrolled_count: number
          session_id: string
        }[]
      }
      get_swim_enrollment_by_waiver_token: {
        Args: { _token: string }
        Returns: {
          child_name: string
          id: string
          is_first_time: boolean
          parent_email: string
          parent_name: string
          payment_status: string
          session_day: string
          session_name: string
          session_start_date: string
          session_start_time: string
          swim_level: string
          waiver_signed_at: string
        }[]
      }
      get_visitor_waiver_links: {
        Args: never
        Returns: {
          child_name: string
          enrollment_id: string
          lesson_booking_id: string
          link_kind: string
          parent_email: string
          swimmer_name: string
          visitor_waiver_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      link_visitor_waiver: { Args: { _waiver_id: string }; Returns: undefined }
      mark_lesson_waiver_signed: { Args: { _token: string }; Returns: string }
      mark_swim_enrollment_waiver_signed: {
        Args: { _token: string }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      release_slot_holds: { Args: { p_session_token: string }; Returns: number }
      soundex: { Args: { "": string }; Returns: string }
      swimmer_has_active_waiver: {
        Args: { _dob: string; _first: string; _last: string }
        Returns: boolean
      }
      swimmer_has_waiver_on_file:
        | {
            Args: { _dob: string; _first: string; _last: string }
            Returns: boolean
          }
        | {
            Args: {
              _dob: string
              _first: string
              _last: string
              _parent_email?: string
              _parent_phone?: string
            }
            Returns: boolean
          }
      text_soundex: { Args: { "": string }; Returns: string }
      unsubscribe_marketing_by_token: {
        Args: { _reason?: string; _token: string }
        Returns: {
          already: boolean
          email: string
        }[]
      }
      upsert_marketing_contact: {
        Args: {
          _email: string
          _first_name: string
          _last_name: string
          _phone: string
          _source: string
          _tags: string[]
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "instructor"
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
      app_role: ["admin", "moderator", "user", "instructor"],
    },
  },
} as const
