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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          id: string
          link: string | null
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      buddies: {
        Row: {
          created_at: string
          id: string
          source: string
          user_high: string
          user_low: string
        }
        Insert: {
          created_at?: string
          id?: string
          source: string
          user_high: string
          user_low: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          user_high?: string
          user_low?: string
        }
        Relationships: []
      }
      buddy_requests: {
        Row: {
          created_at: string
          from_id: string
          id: string
          status: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          status?: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          status?: string
          to_id?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          active: boolean
          country: string
          granularity_min: number
          name: string
          sort: number
          timezone: string
        }
        Insert: {
          active?: boolean
          country?: string
          granularity_min?: number
          name: string
          sort?: number
          timezone?: string
        }
        Update: {
          active?: boolean
          country?: string
          granularity_min?: number
          name?: string
          sort?: number
          timezone?: string
        }
        Relationships: []
      }
      city_areas: {
        Row: {
          area: string
          city: string
          sort: number
        }
        Insert: {
          area: string
          city: string
          sort?: number
        }
        Update: {
          area?: string
          city?: string
          sort?: number
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          at: string
          details: string | null
          id: string
          kind: string
          message: string
          ua: string | null
          user_id: string | null
          where_: string
        }
        Insert: {
          at?: string
          details?: string | null
          id?: string
          kind: string
          message: string
          ua?: string | null
          user_id?: string | null
          where_: string
        }
        Update: {
          at?: string
          details?: string | null
          id?: string
          kind?: string
          message?: string
          ua?: string | null
          user_id?: string | null
          where_?: string
        }
        Relationships: []
      }
      coach_requests: {
        Row: {
          admin_note: string | null
          availability: string[]
          city: string | null
          created_at: string
          goal: string
          id: string
          level: number
          note: string | null
          sport: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          availability?: string[]
          city?: string | null
          created_at?: string
          goal: string
          id?: string
          level?: number
          note?: string | null
          sport?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          availability?: string[]
          city?: string | null
          created_at?: string
          goal?: string
          id?: string
          level?: number
          note?: string | null
          sport?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          area: string | null
          city: string
          created_at: string
          created_by: string | null
          hidden: boolean
          id: string
          is_custom: boolean
          name: string
        }
        Insert: {
          area?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          hidden?: boolean
          id?: string
          is_custom?: boolean
          name: string
        }
        Update: {
          area?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          hidden?: boolean
          id?: string
          is_custom?: boolean
          name?: string
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
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      event_private: {
        Row: {
          contact: string | null
          event_id: string
          swish_number: string | null
        }
        Insert: {
          contact?: string | null
          event_id: string
          swish_number?: string | null
        }
        Update: {
          contact?: string | null
          event_id?: string
          swish_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_private_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      event_requests: {
        Row: {
          capacity: number | null
          city: string | null
          created_at: string
          description: string | null
          duration_min: number | null
          format: string | null
          host_id: string
          id: string
          level_max: number | null
          level_min: number | null
          location: string
          price_sek: number | null
          sport: string
          spots_taken: number
          starts_at: string
          status: string
          title: string
        }
        Insert: {
          capacity?: number | null
          city?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number | null
          format?: string | null
          host_id: string
          id?: string
          level_max?: number | null
          level_min?: number | null
          location: string
          price_sek?: number | null
          sport?: string
          spots_taken?: number
          starts_at: string
          status?: string
          title: string
        }
        Update: {
          capacity?: number | null
          city?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number | null
          format?: string | null
          host_id?: string
          id?: string
          level_max?: number | null
          level_min?: number | null
          location?: string
          price_sek?: number | null
          sport?: string
          spots_taken?: number
          starts_at?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          archived_by: string[]
          confirmed_a: boolean
          confirmed_b: boolean
          court_id: string | null
          created_at: string
          guest_name: string | null
          id: string
          played_at: string
          player_a: string
          player_b: string | null
          reported_noshow: string | null
          score: string | null
          sos_id: string | null
          winner: string | null
        }
        Insert: {
          archived_by?: string[]
          confirmed_a?: boolean
          confirmed_b?: boolean
          court_id?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          played_at: string
          player_a: string
          player_b?: string | null
          reported_noshow?: string | null
          score?: string | null
          sos_id?: string | null
          winner?: string | null
        }
        Update: {
          archived_by?: string[]
          confirmed_a?: boolean
          confirmed_b?: boolean
          court_id?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          played_at?: string
          player_a?: string
          player_b?: string | null
          reported_noshow?: string | null
          score?: string | null
          sos_id?: string | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_sos_id_fkey"
            columns: ["sos_id"]
            isOneToOne: false
            referencedRelation: "sos_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          owner_id: string | null
          uses_remaining: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          owner_id?: string | null
          uses_remaining?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          owner_id?: string | null
          uses_remaining?: number
        }
        Relationships: []
      }
      kudos: {
        Row: {
          created_at: string
          from_id: string
          id: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          to_id?: string
        }
        Relationships: []
      }
      lifecycle_sends: {
        Row: {
          id: string
          sent_at: string
          template: string
          user_id: string
        }
        Insert: {
          id?: string
          sent_at?: string
          template: string
          user_id: string
        }
        Update: {
          id?: string
          sent_at?: string
          template?: string
          user_id?: string
        }
        Relationships: []
      }
      membership_claims: {
        Row: {
          amount_sek: number
          created_at: string
          id: string
          period: string
          resolved_at: string | null
          status: string
          tier: string
          user_id: string
        }
        Insert: {
          amount_sek: number
          created_at?: string
          id?: string
          period: string
          resolved_at?: string | null
          status?: string
          tier: string
          user_id: string
        }
        Update: {
          amount_sek?: number
          created_at?: string
          id?: string
          period?: string
          resolved_at?: string | null
          status?: string
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          accepted_terms_version: string | null
          areas: string[]
          bio: string | null
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          buddy_sos_optin: boolean
          confirmed_adult: boolean
          created_at: string
          email_digest: boolean
          email_level: string
          email_notifs: boolean
          events_optin: boolean
          experience: string | null
          fav_shot: string | null
          formats: string[]
          games_played: number
          ghost_badge: boolean
          goals: string[] | null
          home_cities: string[] | null
          home_city: string
          home_courts: string | null
          id: string
          installed_at: string | null
          is_admin: boolean
          lang: string
          last_name: string | null
          last_seen_at: string | null
          last_standalone_at: string | null
          level: number
          looking_for: Database["public"]["Enums"]["looking_for_t"]
          member_since: string | null
          member_tier: string | null
          member_until: string | null
          name: string
          phone_e164: string
          photo_url: string | null
          photos: string[]
          play_times: string[]
          public_preview: boolean
          push_max_per_week: number
          push_wake_me: boolean
          referrals_count: number
          rescues_count: number
          signup_code: string | null
          sports: string[]
          vibe: Database["public"]["Enums"]["vibe_t"]
        }
        Insert: {
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          areas?: string[]
          bio?: string | null
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km?: number
          buddy_sos_optin?: boolean
          confirmed_adult?: boolean
          created_at?: string
          email_digest?: boolean
          email_level?: string
          email_notifs?: boolean
          events_optin?: boolean
          experience?: string | null
          fav_shot?: string | null
          formats?: string[]
          games_played?: number
          ghost_badge?: boolean
          goals?: string[] | null
          home_cities?: string[] | null
          home_city?: string
          home_courts?: string | null
          id: string
          installed_at?: string | null
          is_admin?: boolean
          lang?: string
          last_name?: string | null
          last_seen_at?: string | null
          last_standalone_at?: string | null
          level: number
          looking_for?: Database["public"]["Enums"]["looking_for_t"]
          member_since?: string | null
          member_tier?: string | null
          member_until?: string | null
          name: string
          phone_e164: string
          photo_url?: string | null
          photos?: string[]
          play_times?: string[]
          public_preview?: boolean
          push_max_per_week?: number
          push_wake_me?: boolean
          referrals_count?: number
          rescues_count?: number
          signup_code?: string | null
          sports?: string[]
          vibe?: Database["public"]["Enums"]["vibe_t"]
        }
        Update: {
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          areas?: string[]
          bio?: string | null
          buddy_optin?: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km?: number
          buddy_sos_optin?: boolean
          confirmed_adult?: boolean
          created_at?: string
          email_digest?: boolean
          email_level?: string
          email_notifs?: boolean
          events_optin?: boolean
          experience?: string | null
          fav_shot?: string | null
          formats?: string[]
          games_played?: number
          ghost_badge?: boolean
          goals?: string[] | null
          home_cities?: string[] | null
          home_city?: string
          home_courts?: string | null
          id?: string
          installed_at?: string | null
          is_admin?: boolean
          lang?: string
          last_name?: string | null
          last_seen_at?: string | null
          last_standalone_at?: string | null
          level?: number
          looking_for?: Database["public"]["Enums"]["looking_for_t"]
          member_since?: string | null
          member_tier?: string | null
          member_until?: string | null
          name?: string
          phone_e164?: string
          photo_url?: string | null
          photos?: string[]
          play_times?: string[]
          public_preview?: boolean
          push_max_per_week?: number
          push_wake_me?: boolean
          referrals_count?: number
          rescues_count?: number
          signup_code?: string | null
          sports?: string[]
          vibe?: Database["public"]["Enums"]["vibe_t"]
        }
        Relationships: []
      }
      push_events: {
        Row: {
          id: string
          kind: string
          sent_at: string
          sos_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          kind?: string
          sent_at?: string
          sos_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          sos_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_events_sos_id_fkey"
            columns: ["sos_id"]
            isOneToOne: false
            referencedRelation: "sos_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          fail_count: number
          id: string
          last_seen_at: string
          p256dh: string
          ua: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          fail_count?: number
          id?: string
          last_seen_at?: string
          p256dh: string
          ua?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          fail_count?: number
          id?: string
          last_seen_at?: string
          p256dh?: string
          ua?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sos_applications: {
        Row: {
          applicant_id: string
          created_at: string
          ct_pref: string | null
          id: string
          proposed_at: string | null
          sos_id: string
          status: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          ct_pref?: string | null
          id?: string
          proposed_at?: string | null
          sos_id: string
          status?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          ct_pref?: string | null
          id?: string
          proposed_at?: string | null
          sos_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_applications_sos_id_fkey"
            columns: ["sos_id"]
            isOneToOne: false
            referencedRelation: "sos_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_requests: {
        Row: {
          auto_flare: boolean
          booking_link: string | null
          broadcast: boolean
          caller_id: string
          cancel_nudged_at: string | null
          claimed_by: string | null
          court_id: string | null
          court_status: Database["public"]["Enums"]["court_status_t"]
          court_type: Database["public"]["Enums"]["court_type_t"]
          court_type_any: boolean
          created_at: string
          duration_min: number
          flared_at: string | null
          format: Database["public"]["Enums"]["sos_format_t"]
          ghost_claim_token: string | null
          ghost_name: string | null
          id: string
          invite_join_token: string | null
          kind: string
          level_max: number
          level_min: number
          note: string | null
          play_at: string
          play_until: string | null
          sport: string
          spots_filled: number
          spots_needed: number
          status: Database["public"]["Enums"]["sos_status_t"]
        }
        Insert: {
          auto_flare?: boolean
          booking_link?: string | null
          broadcast?: boolean
          caller_id: string
          cancel_nudged_at?: string | null
          claimed_by?: string | null
          court_id?: string | null
          court_status: Database["public"]["Enums"]["court_status_t"]
          court_type?: Database["public"]["Enums"]["court_type_t"]
          court_type_any?: boolean
          created_at?: string
          duration_min?: number
          flared_at?: string | null
          format: Database["public"]["Enums"]["sos_format_t"]
          ghost_claim_token?: string | null
          ghost_name?: string | null
          id?: string
          invite_join_token?: string | null
          kind?: string
          level_max?: number
          level_min?: number
          note?: string | null
          play_at: string
          play_until?: string | null
          sport?: string
          spots_filled?: number
          spots_needed?: number
          status?: Database["public"]["Enums"]["sos_status_t"]
        }
        Update: {
          auto_flare?: boolean
          booking_link?: string | null
          broadcast?: boolean
          caller_id?: string
          cancel_nudged_at?: string | null
          claimed_by?: string | null
          court_id?: string | null
          court_status?: Database["public"]["Enums"]["court_status_t"]
          court_type?: Database["public"]["Enums"]["court_type_t"]
          court_type_any?: boolean
          created_at?: string
          duration_min?: number
          flared_at?: string | null
          format?: Database["public"]["Enums"]["sos_format_t"]
          ghost_claim_token?: string | null
          ghost_name?: string | null
          id?: string
          invite_join_token?: string | null
          kind?: string
          level_max?: number
          level_min?: number
          note?: string | null
          play_at?: string
          play_until?: string | null
          sport?: string
          spots_filled?: number
          spots_needed?: number
          status?: Database["public"]["Enums"]["sos_status_t"]
        }
        Relationships: [
          {
            foreignKeyName: "sos_requests_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
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
      swipes: {
        Row: {
          created_at: string
          id: string
          liked: boolean
          liker_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          liked: boolean
          liker_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          liked?: boolean
          liker_id?: string
          target_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          note: string | null
          purchase: string
          resolved_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          note?: string | null
          purchase: string
          resolved_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          note?: string | null
          purchase?: string
          resolved_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _add_buddy: {
        Args: { _a: string; _b: string; _source: string }
        Returns: undefined
      }
      _court_when: {
        Args: { _city: string; _lang: string; _ts: string }
        Returns: string
      }
      _email_users: {
        Args: {
          _body: string
          _ids: string[]
          _kind?: string
          _tag: string
          _title: string
          _url: string
        }
        Returns: undefined
      }
      _notify_headers: { Args: never; Returns: Json }
      _push_users: {
        Args: {
          _body: string
          _ids: string[]
          _kind?: string
          _tag: string
          _title: string
          _url: string
        }
        Returns: undefined
      }
      accept_terms: { Args: { _version: string }; Returns: undefined }
      active_sos_count: { Args: { _uid: string }; Returns: number }
      admin_client_errors: {
        Args: { _hours?: number }
        Returns: {
          kind: string
          last_at: string
          message: string
          n: number
          sample: string
          users: number
          where_: string
        }[]
      }
      admin_courts_list: {
        Args: never
        Returns: {
          area: string
          city: string
          created_at: string
          created_by: string
          creator_name: string
          hidden: boolean
          id: string
          name: string
          usage_count: number
        }[]
      }
      admin_create_invite_code: {
        Args: { _code: string; _owner_id: string; _uses: number }
        Returns: undefined
      }
      admin_dashboard: { Args: never; Returns: Json }
      admin_delete_invite_code: { Args: { _code: string }; Returns: undefined }
      admin_health: { Args: never; Returns: Json }
      admin_invite_codes: {
        Args: never
        Returns: {
          active: boolean
          code: string
          created_at: string
          signups: number
          uses_remaining: number
        }[]
      }
      admin_lifecycle_status: {
        Args: never
        Returns: {
          enabled: boolean
          last_sent: string
          sent_30d: number
          sent_7d: number
          template: string
        }[]
      }
      admin_list_coach_requests: {
        Args: never
        Returns: {
          admin_note: string
          availability: string[]
          city: string
          created_at: string
          goal: string
          id: string
          last_name: string
          level: number
          name: string
          note: string
          phone_e164: string
          sport: string
          status: string
          user_id: string
        }[]
      }
      admin_list_reports: {
        Args: never
        Returns: {
          created_at: string
          details: string
          id: string
          reason: string
          reporter_name: string
          resolution_note: string
          resolved_at: string
          status: string
          target_id: string
          target_name: string
        }[]
      }
      admin_list_withdrawals: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          name: string
          note: string | null
          purchase: string
          resolved_at: string | null
          status: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "withdrawal_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_membership_claims: {
        Args: never
        Returns: {
          amount_sek: number
          created_at: string
          id: string
          last_name: string
          name: string
          period: string
          resolved_at: string
          status: string
          tier: string
          user_id: string
        }[]
      }
      admin_players_list: {
        Args: never
        Returns: {
          bio: string
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          buddy_sos_optin: boolean
          created_at: string
          email_level: string
          fav_shot: string
          formats: string[]
          games_played: number
          ghost_badge: boolean
          home_cities: string[]
          home_city: string
          home_courts: string
          id: string
          installed_at: string
          is_admin: boolean
          last_name: string
          last_seen_at: string
          level: number
          looking_for: Database["public"]["Enums"]["looking_for_t"]
          member_since: string
          member_tier: string
          name: string
          phone_e164: string
          play_times: string[]
          push_on: boolean
          rescues_count: number
          signup_code: string
          vibe: Database["public"]["Enums"]["vibe_t"]
        }[]
      }
      admin_resolve_claim: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: { _id: string; _note?: string; _status: string }
        Returns: undefined
      }
      admin_resolve_withdrawal: {
        Args: { _id: string; _status: string }
        Returns: undefined
      }
      admin_set_coach_request: {
        Args: { _admin_note?: string; _id: string; _status: string }
        Returns: undefined
      }
      admin_set_court_hidden: {
        Args: { _court_id: string; _hidden: boolean }
        Returns: undefined
      }
      admin_set_invite_active: {
        Args: { _active: boolean; _code: string }
        Returns: undefined
      }
      admin_set_lifecycle: { Args: { _on: boolean }; Returns: undefined }
      admin_set_member: {
        Args: { _tier: string; _user: string }
        Returns: undefined
      }
      admin_stats: {
        Args: never
        Returns: {
          active_sos_count: number
          fill_rate: number
          profiles_count: number
        }[]
      }
      admin_update_court: {
        Args: { _area: string; _court_id: string; _name: string }
        Returns: undefined
      }
      admin_user_emails: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          last_sign_in_at: string
          name: string
        }[]
      }
      apply_to_game: {
        Args: { _ct_pref?: string; _proposed_at?: string; _sos_id: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      archive_game: { Args: { _game_id: string }; Returns: undefined }
      cancel_coach_request: { Args: { _id: string }; Returns: boolean }
      cancel_game: {
        Args: { _sos_id: string }
        Returns: {
          applicant_ids: string[]
          claimer_ids: string[]
          notified: boolean
        }[]
      }
      cancel_sos: { Args: { _sos_id: string }; Returns: undefined }
      check_invite_code: { Args: { _code: string }; Returns: boolean }
      claim_ghost_game: {
        Args: { _sos_id: string; _token: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      claim_membership: {
        Args: { _amount: number; _period: string; _tier: string }
        Returns: string
      }
      claim_sos: {
        Args: { _sos_id: string }
        Returns: {
          game_id: string
          ok: boolean
          reason: string
          sos_id: string
        }[]
      }
      clear_announcements: { Args: never; Returns: undefined }
      close_my_coach_request: { Args: { _id: string }; Returns: boolean }
      community_stats: {
        Args: { _city: string }
        Returns: {
          all_time_games: number
          games_matched: number
          new_buddies: number
          sets_saved: number
        }[]
      }
      confirm_game: {
        Args: { _game_id: string; _score?: string; _winner?: string }
        Returns: undefined
      }
      count_matching_rescuers: { Args: { _sos_id: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_my_account: { Args: never; Returns: undefined }
      delete_my_event: { Args: { _id: string }; Returns: undefined }
      delete_push_subscription: {
        Args: { _endpoint: string }
        Returns: undefined
      }
      do_swipe: {
        Args: { _like: boolean; _target: string }
        Returns: {
          is_match: boolean
        }[]
      }
      edit_sos: {
        Args: {
          _court_id: string
          _court_status: string
          _court_type: string
          _court_type_any?: boolean
          _duration_min: number
          _format: string
          _level_max: number
          _level_min: number
          _note: string
          _play_at: string
          _play_until?: string
          _sos_id: string
          _sport?: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      eligible_open_games_for_me: {
        Args: never
        Returns: {
          caller_id: string
          caller_name: string
          claimed_by: string
          court_area: string
          court_city: string
          court_id: string
          court_name: string
          court_status: Database["public"]["Enums"]["court_status_t"]
          court_type: Database["public"]["Enums"]["court_type_t"]
          court_type_any: boolean
          created_at: string
          format: Database["public"]["Enums"]["sos_format_t"]
          ghost_name: string
          id: string
          is_buddy: boolean
          level_max: number
          level_min: number
          note: string
          play_at: string
          play_until: string
          sport: string
          status: Database["public"]["Enums"]["sos_status_t"]
        }[]
      }
      eligible_sos_for_me: {
        Args: never
        Returns: {
          caller_id: string
          caller_name: string
          claimed_by: string
          court_area: string
          court_city: string
          court_id: string
          court_name: string
          court_status: Database["public"]["Enums"]["court_status_t"]
          court_type: Database["public"]["Enums"]["court_type_t"]
          court_type_any: boolean
          created_at: string
          format: Database["public"]["Enums"]["sos_format_t"]
          ghost_name: string
          id: string
          is_buddy: boolean
          level_max: number
          level_min: number
          note: string
          play_at: string
          play_until: string
          sport: string
          status: Database["public"]["Enums"]["sos_status_t"]
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_my_invite_code: { Args: never; Returns: string }
      escalate_due_open_games: { Args: never; Returns: number }
      event_attendee_contacts: {
        Args: { _event_id: string }
        Returns: {
          id: string
          name: string
          phone_e164: string
          status: string
          user_id: string
        }[]
      }
      expire_old_sos: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      flare_my_game: {
        Args: { _sos_id: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      founders_wall: {
        Args: never
        Returns: {
          id: string
          last_name: string
          member_since: string
          member_tier: string
          name: string
          photo_url: string
        }[]
      }
      get_contact_phone: {
        Args: { _target: string }
        Returns: {
          name: string
          phone: string
        }[]
      }
      get_event_contact: { Args: { _event_id: string }; Returns: string }
      get_event_swish: { Args: { _event_id: string }; Returns: string }
      get_member_config: {
        Args: never
        Returns: {
          key: string
          value: string
        }[]
      }
      get_my_full_profile: {
        Args: never
        Returns: {
          accepted_terms_at: string | null
          accepted_terms_version: string | null
          areas: string[]
          bio: string | null
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          buddy_sos_optin: boolean
          confirmed_adult: boolean
          created_at: string
          email_digest: boolean
          email_level: string
          email_notifs: boolean
          events_optin: boolean
          experience: string | null
          fav_shot: string | null
          formats: string[]
          games_played: number
          ghost_badge: boolean
          goals: string[] | null
          home_cities: string[] | null
          home_city: string
          home_courts: string | null
          id: string
          installed_at: string | null
          is_admin: boolean
          lang: string
          last_name: string | null
          last_seen_at: string | null
          last_standalone_at: string | null
          level: number
          looking_for: Database["public"]["Enums"]["looking_for_t"]
          member_since: string | null
          member_tier: string | null
          member_until: string | null
          name: string
          phone_e164: string
          photo_url: string | null
          photos: string[]
          play_times: string[]
          public_preview: boolean
          push_max_per_week: number
          push_wake_me: boolean
          referrals_count: number
          rescues_count: number
          signup_code: string | null
          sports: string[]
          vibe: Database["public"]["Enums"]["vibe_t"]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_support_swish: { Args: never; Returns: string }
      give_kudos: { Args: { _to: string }; Returns: number }
      is_buddy: { Args: { _a: string; _b: string }; Returns: boolean }
      join_event: {
        Args: { _event_id: string }
        Returns: {
          attendee_status: string
          ok: boolean
          reason: string
        }[]
      }
      join_game_by_token: {
        Args: { _sos_id: string; _token: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      kudos_by: {
        Args: { _to: string }
        Returns: {
          from_id: string
          name: string
          photo_url: string
        }[]
      }
      kudos_for: {
        Args: { _ids: string[] }
        Returns: {
          mine: boolean
          n: number
          to_id: string
        }[]
      }
      leave_event: { Args: { _event_id: string }; Returns: undefined }
      log_game: {
        Args: {
          _court_id?: string
          _guest_name?: string
          _other_id?: string
          _played_at?: string
          _score?: string
          _winner?: string
        }
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
      my_invite_uses: { Args: never; Returns: number }
      my_membership_claims: {
        Args: never
        Returns: {
          amount_sek: number
          created_at: string
          id: string
          period: string
          status: string
          tier: string
        }[]
      }
      my_open_coach_request: {
        Args: never
        Returns: {
          admin_note: string | null
          availability: string[]
          city: string | null
          created_at: string
          goal: string
          id: string
          level: number
          note: string | null
          sport: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "coach_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pick_applicant: {
        Args: { _applicant: string; _sos_id: string }
        Returns: {
          game_id: string
          ok: boolean
          reason: string
        }[]
      }
      players_directory: {
        Args: { _ids?: string[] }
        Returns: {
          areas: string[]
          bio: string
          buddy_optin: Database["public"]["Enums"]["buddy_optin_t"]
          buddy_radius_km: number
          created_at: string
          experience: string
          fav_shot: string
          formats: string[]
          games_played: number
          ghost_badge: boolean
          goals: string[]
          home_cities: string[]
          home_city: string
          home_courts: string
          id: string
          last_name: string
          level: number
          looking_for: Database["public"]["Enums"]["looking_for_t"]
          member_tier: string
          name: string
          photo_url: string
          play_times: string[]
          rescues_count: number
          sports: string[]
          vibe: Database["public"]["Enums"]["vibe_t"]
        }[]
      }
      post_announcement: {
        Args: { _body: string; _link?: string }
        Returns: string
      }
      public_board: {
        Args: never
        Returns: {
          caller_id: string
          caller_name: string
          caller_photo: string
          court_city: string
          court_name: string
          court_status: string
          court_type: string
          court_type_any: boolean
          created_at: string
          format: string
          id: string
          kind: string
          level_max: number
          level_min: number
          play_at: string
          play_until: string
          sport: string
          spots_filled: number
          spots_needed: number
        }[]
      }
      public_game: {
        Args: { _id: string }
        Returns: {
          court_city: string
          court_name: string
          court_status: string
          court_type: string
          court_type_any: boolean
          format: string
          host_name: string
          host_photo: string
          id: string
          kind: string
          level_max: number
          level_min: number
          play_at: string
          play_until: string
          spots_filled: number
          spots_needed: number
          status: string
        }[]
      }
      public_players: {
        Args: { _limit?: number }
        Returns: {
          games_played: number
          home_city: string
          id: string
          level: number
          name: string
          photo_url: string
          rescues_count: number
          vibe: string
        }[]
      }
      publish_my_game: {
        Args: { _sos_id: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      purge_old_logs: { Args: never; Returns: undefined }
      random_player_for_me: {
        Args: never
        Returns: {
          bio: string
          experience: string
          fav_shot: string
          formats: string[]
          games_played: number
          goals: string[]
          home_cities: string[]
          home_city: string
          home_courts: string
          id: string
          level: number
          looking_for: string
          member_since: string
          name: string
          photo_url: string
          photos: string[]
          play_times: string[]
          rescues_count: number
          sports: string[]
          vibe: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      release_applicants: { Args: { _sos_id: string }; Returns: number }
      remove_buddy: { Args: { _other: string }; Returns: undefined }
      report_client_error: {
        Args: {
          _details?: string
          _kind: string
          _message: string
          _ua?: string
          _where: string
        }
        Returns: undefined
      }
      report_noshow: { Args: { _game_id: string }; Returns: undefined }
      report_user: {
        Args: { _details?: string; _reason: string; _target: string }
        Returns: undefined
      }
      request_buddy: { Args: { _other: string }; Returns: undefined }
      request_coach: {
        Args: {
          _availability: string[]
          _goal: string
          _note?: string
          _sport: string
        }
        Returns: {
          id: string
          ok: boolean
          reason: string
        }[]
      }
      respond_buddy_request: {
        Args: { _accept: boolean; _req_id: string }
        Returns: undefined
      }
      save_my_profile: { Args: { _data: Json }; Returns: undefined }
      save_push_prefs: {
        Args: {
          _events_optin?: boolean
          _max_per_week: number
          _radius: number
          _sos_optin: boolean
          _wake_me: boolean
        }
        Returns: undefined
      }
      save_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _ua?: string
        }
        Returns: undefined
      }
      set_booking_link: {
        Args: { _sos_id: string; _url: string }
        Returns: undefined
      }
      set_member_config: {
        Args: { _key: string; _value: string }
        Returns: undefined
      }
      set_my_invite_code: { Args: { _new: string }; Returns: string }
      set_support_swish: { Args: { _number: string }; Returns: undefined }
      sos_push_targets: {
        Args: { _sos_id: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          user_id: string
        }[]
      }
      submit_withdrawal: {
        Args: {
          _email: string
          _name: string
          _note?: string
          _purchase: string
        }
        Returns: string
      }
      swipe_deck: {
        Args: never
        Returns: {
          areas: string[]
          bio: string
          experience: string
          fav_shot: string
          formats: string[]
          games_played: number
          goals: string[]
          home_cities: string[]
          home_city: string
          home_courts: string
          id: string
          level: number
          looking_for: string
          member_since: string
          name: string
          photo_url: string
          photos: string[]
          play_times: string[]
          rescues_count: number
          sports: string[]
          vibe: string
        }[]
      }
      top_active_month: {
        Args: never
        Returns: {
          n: number
          name: string
          user_id: string
        }[]
      }
      top_hosts_month: {
        Args: never
        Returns: {
          n: number
          name: string
          user_id: string
        }[]
      }
      top_rescuers_month: {
        Args: never
        Returns: {
          name: string
          rescues: number
          user_id: string
        }[]
      }
      touch_presence: { Args: { _standalone?: boolean }; Returns: undefined }
      unsubscribe_email: { Args: { _token: string }; Returns: boolean }
      update_my_event: {
        Args: { _data: Json; _id: string }
        Returns: undefined
      }
      weekly_recap_push: { Args: never; Returns: number }
      widen_my_game: {
        Args: { _sos_id: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      withdraw_application: { Args: { _sos_id: string }; Returns: boolean }
      withdraw_claim: {
        Args: { _sos_id: string }
        Returns: {
          ok: boolean
          re_flared: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      buddy_optin_t: "yes" | "sometimes" | "no"
      court_status_t: "booked_paid" | "booked" | "will_book" | "public"
      court_type_t: "indoor" | "outdoor"
      looking_for_t: "regular" | "dropin" | "both"
      sos_format_t:
        | "singles"
        | "doubles_need1"
        | "doubles_need2"
        | "doubles_need3"
      sos_status_t: "active" | "claimed" | "expired" | "cancelled"
      vibe_t: "chill" | "friendly" | "sweat"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      buddy_optin_t: ["yes", "sometimes", "no"],
      court_status_t: ["booked_paid", "booked", "will_book", "public"],
      court_type_t: ["indoor", "outdoor"],
      looking_for_t: ["regular", "dropin", "both"],
      sos_format_t: [
        "singles",
        "doubles_need1",
        "doubles_need2",
        "doubles_need3",
      ],
      sos_status_t: ["active", "claimed", "expired", "cancelled"],
      vibe_t: ["chill", "friendly", "sweat"],
    },
  },
} as const
