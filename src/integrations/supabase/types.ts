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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
        }
        Relationships: []
      }
      badge_definitions: {
        Row: {
          audience: string
          color_key: string
          created_at: string
          description: string | null
          display_variant: string
          icon_key: string
          id: string
          image_url: string | null
          is_active: boolean
          key: string
          kind: string
          name: string
          permissions: string[]
          sort_order: number
          style_key: string
          threshold: number
          updated_at: string
        }
        Insert: {
          audience?: string
          color_key?: string
          created_at?: string
          description?: string | null
          display_variant?: string
          icon_key?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          key: string
          kind?: string
          name: string
          permissions?: string[]
          sort_order?: number
          style_key?: string
          threshold: number
          updated_at?: string
        }
        Update: {
          audience?: string
          color_key?: string
          created_at?: string
          description?: string | null
          display_variant?: string
          icon_key?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          key?: string
          kind?: string
          name?: string
          permissions?: string[]
          sort_order?: number
          style_key?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          kind: string
          link_url: string | null
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string
          link_url?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string
          link_url?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bans: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          reason: string | null
          room_id: string | null
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          room_id?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          room_id?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      coin_packages: {
        Row: {
          bonus_coins: number
          coins: number
          currency: string
          discount_percent: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          bonus_coins?: number
          coins: number
          currency?: string
          discount_percent?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          bonus_coins?: number
          coins?: number
          currency?: string
          discount_percent?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      coin_purchase_requests: {
        Row: {
          amount_cents: number
          coins: number
          created_at: string
          currency: string
          id: string
          method: string
          note: string | null
          package_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          coins: number
          created_at?: string
          currency?: string
          id?: string
          method: string
          note?: string | null
          package_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_reference: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          coins?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string
          note?: string | null
          package_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_purchase_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "coin_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          kind: string
          reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          kind: string
          reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          kind?: string
          reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      coin_wallets: {
        Row: {
          coins: number
          total_received: number
          total_sent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coins?: number
          total_received?: number
          total_sent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coins?: number
          total_received?: number
          total_sent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cup_event_payouts: {
        Row: {
          beneficiary_user_id: string
          coins: number
          event_id: string
          id: string
          paid_at: string
          rank: number
          score: number
        }
        Insert: {
          beneficiary_user_id: string
          coins: number
          event_id: string
          id?: string
          paid_at?: string
          rank: number
          score: number
        }
        Update: {
          beneficiary_user_id?: string
          coins?: number
          event_id?: string
          id?: string
          paid_at?: string
          rank?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "cup_event_payouts_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_event_payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cup_events"
            referencedColumns: ["id"]
          },
        ]
      }
      cup_event_prizes: {
        Row: {
          coins: number
          created_at: string
          event_id: string
          id: string
          label: string
          rank_from: number
          rank_to: number
        }
        Insert: {
          coins: number
          created_at?: string
          event_id: string
          id?: string
          label: string
          rank_from: number
          rank_to: number
        }
        Update: {
          coins?: number
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          rank_from?: number
          rank_to?: number
        }
        Relationships: [
          {
            foreignKeyName: "cup_event_prizes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cup_events"
            referencedColumns: ["id"]
          },
        ]
      }
      cup_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          image_url: string | null
          ranking_kind: string
          starts_at: string
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          image_url?: string | null
          ranking_kind: string
          starts_at: string
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          image_url?: string | null
          ranking_kind?: string
          starts_at?: string
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cup_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cvip_plans: {
        Row: {
          background_url: string | null
          badge_url: string | null
          created_at: string
          decorations: Json
          description: string | null
          duration_days: number
          frame_url: string | null
          id: string
          is_active: boolean
          name: string
          name_effect: string | null
          perks: Json
          price: number
          room_effect: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          background_url?: string | null
          badge_url?: string | null
          created_at?: string
          decorations?: Json
          description?: string | null
          duration_days: number
          frame_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_effect?: string | null
          perks?: Json
          price: number
          room_effect?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          background_url?: string | null
          badge_url?: string | null
          created_at?: string
          decorations?: Json
          description?: string | null
          duration_days?: number
          frame_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_effect?: string | null
          perks?: Json
          price?: number
          room_effect?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      domino_games: {
        Row: {
          bet: number
          created_at: string
          id: string
          player1_id: string
          player2_id: string | null
          room_id: string | null
          state: Json
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          bet: number
          created_at?: string
          id?: string
          player1_id: string
          player2_id?: string | null
          room_id?: string | null
          state?: Json
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          bet?: number
          created_at?: string
          id?: string
          player1_id?: string
          player2_id?: string | null
          room_id?: string | null
          state?: Json
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domino_games_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friend_status"]
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friend_status"]
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friend_status"]
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          bet: number
          created_at: string
          game: string
          id: string
          payout: number
          result: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bet?: number
          created_at?: string
          game: string
          id?: string
          payout?: number
          result?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bet?: number
          created_at?: string
          game?: string
          id?: string
          payout?: number
          result?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gift_transactions: {
        Row: {
          created_at: string
          gift_id: string
          id: string
          quantity: number
          receiver_id: string
          room_id: string | null
          sender_id: string
          total_price: number
        }
        Insert: {
          created_at?: string
          gift_id: string
          id?: string
          quantity?: number
          receiver_id: string
          room_id?: string | null
          sender_id: string
          total_price: number
        }
        Update: {
          created_at?: string
          gift_id?: string
          id?: string
          quantity?: number
          receiver_id?: string
          room_id?: string | null
          sender_id?: string
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_transactions_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          animation_url: string | null
          category: string
          created_at: string
          display_scale: number
          duration_ms: number
          emoji: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          rarity: string
          required_vip: number
          sort_order: number
          sound_enabled: boolean
          sound_url: string | null
          thumb_url: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          animation_url?: string | null
          category?: string
          created_at?: string
          display_scale?: number
          duration_ms?: number
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          rarity?: string
          required_vip?: number
          sort_order?: number
          sound_enabled?: boolean
          sound_url?: string | null
          thumb_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          animation_url?: string | null
          category?: string
          created_at?: string
          display_scale?: number
          duration_ms?: number
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          rarity?: string
          required_vip?: number
          sort_order?: number
          sound_enabled?: boolean
          sound_url?: string | null
          thumb_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      lucky_bag_claims: {
        Row: {
          amount: number
          bag_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          bag_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          bag_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lucky_bag_claims_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "lucky_bags"
            referencedColumns: ["id"]
          },
        ]
      }
      lucky_bags: {
        Row: {
          claimed_count: number
          created_at: string
          expires_at: string
          id: string
          message: string | null
          remaining_amount: number
          room_id: string
          sender_id: string
          status: string
          total_amount: number
          winners_count: number
        }
        Insert: {
          claimed_count?: number
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          remaining_amount: number
          room_id: string
          sender_id: string
          status?: string
          total_amount: number
          winners_count: number
        }
        Update: {
          claimed_count?: number
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          remaining_amount?: number
          room_id?: string
          sender_id?: string
          status?: string
          total_amount?: number
          winners_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lucky_bags_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      mic_requests: {
        Row: {
          created_at: string
          id: string
          room_id: string
          seat_index: number | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          room_id: string
          seat_index?: number | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          room_id?: string
          seat_index?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mic_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_gift_totals: {
        Row: {
          gift_id: string
          quantity: number
          total_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          gift_id: string
          quantity?: number
          total_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          gift_id?: string
          quantity?: number
          total_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_gift_totals_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          cvip_expires_at: string | null
          display_name: string
          frame_url: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_cvip: boolean
          is_online: boolean
          is_suspended: boolean
          last_seen: string
          level: number
          mic_decoration_url: string | null
          profile_background_url: string | null
          public_id: string
          updated_at: string
          vip_expires_at: string | null
          vip_level: number
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          cvip_expires_at?: string | null
          display_name: string
          frame_url?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_cvip?: boolean
          is_online?: boolean
          is_suspended?: boolean
          last_seen?: string
          level?: number
          mic_decoration_url?: string | null
          profile_background_url?: string | null
          public_id: string
          updated_at?: string
          vip_expires_at?: string | null
          vip_level?: number
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          cvip_expires_at?: string | null
          display_name?: string
          frame_url?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_cvip?: boolean
          is_online?: boolean
          is_suspended?: boolean
          last_seen?: string
          level?: number
          mic_decoration_url?: string | null
          profile_background_url?: string | null
          public_id?: string
          updated_at?: string
          vip_expires_at?: string | null
          vip_level?: number
          xp?: number
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          choices: Json
          correct_index: number
          created_at: string
          difficulty: number
          id: string
          is_active: boolean
          question: string
          updated_at: string
        }
        Insert: {
          choices: Json
          correct_index: number
          created_at?: string
          difficulty?: number
          id?: string
          is_active?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          choices?: Json
          correct_index?: number
          created_at?: string
          difficulty?: number
          id?: string
          is_active?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      relationships: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          partner_id: string
          requester_id: string
          started_at: string | null
          status: string
          type: Database["public"]["Enums"]["relation_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          partner_id: string
          requester_id: string
          started_at?: string | null
          status?: string
          type: Database["public"]["Enums"]["relation_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          partner_id?: string
          requester_id?: string
          started_at?: string | null
          status?: string
          type?: Database["public"]["Enums"]["relation_type"]
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      room_members: {
        Row: {
          id: string
          is_muted: boolean
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_muted?: boolean
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_muted?: boolean
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          room_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          room_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_mics: {
        Row: {
          decoration_url: string | null
          id: string
          is_locked: boolean
          is_muted: boolean
          room_id: string
          seat_index: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          decoration_url?: string | null
          id?: string
          is_locked?: boolean
          is_muted?: boolean
          room_id: string
          seat_index: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          decoration_url?: string | null
          id?: string
          is_locked?: boolean
          is_muted?: boolean
          room_id?: string
          seat_index?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_mics_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_moderators: {
        Row: {
          created_at: string
          id: string
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_moderators_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          background_url: string | null
          category: string
          chat_locked: boolean
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_disabled: boolean
          max_users: number
          member_count: number
          mic_count: number
          name: string
          owner_id: string
          password: string | null
          popularity: number
          room_code: string
          room_type: Database["public"]["Enums"]["room_type"]
          theme: string | null
          updated_at: string
        }
        Insert: {
          background_url?: string | null
          category?: string
          chat_locked?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_disabled?: boolean
          max_users?: number
          member_count?: number
          mic_count?: number
          name: string
          owner_id: string
          password?: string | null
          popularity?: number
          room_code: string
          room_type?: Database["public"]["Enums"]["room_type"]
          theme?: string | null
          updated_at?: string
        }
        Update: {
          background_url?: string | null
          category?: string
          chat_locked?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_disabled?: boolean
          max_users?: number
          member_count?: number
          mic_count?: number
          name?: string
          owner_id?: string
          password?: string | null
          popularity?: number
          room_code?: string
          room_type?: Database["public"]["Enums"]["room_type"]
          theme?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_days: number | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          rarity: string
          required_vip: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration_days?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          rarity?: string
          required_vip?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_days?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          rarity?: string
          required_vip?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          progress: number
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          progress?: number
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          progress?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_items: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_equipped: boolean
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_equipped?: boolean
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_equipped?: boolean
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vip_levels: {
        Row: {
          badge_url: string | null
          duration_days: number
          frame_url: string | null
          is_active: boolean
          level: number
          name: string
          name_effect: string | null
          perks: Json
          price: number
          profile_effect: string | null
          room_effect: string | null
        }
        Insert: {
          badge_url?: string | null
          duration_days?: number
          frame_url?: string | null
          is_active?: boolean
          level: number
          name: string
          name_effect?: string | null
          perks?: Json
          price: number
          profile_effect?: string | null
          room_effect?: string | null
        }
        Update: {
          badge_url?: string | null
          duration_days?: number
          frame_url?: string | null
          is_active?: boolean
          level?: number
          name?: string
          name_effect?: string | null
          perks?: Json
          price?: number
          profile_effect?: string | null
          room_effect?: string | null
        }
        Relationships: []
      }
      welcome_claims: {
        Row: {
          claimed_at: string
          claimed_by: string | null
          created_at: string
          device_identifier: string | null
          id: string
          status: string
          user_id: string
          video_url: string | null
          welcome_package: Json
        }
        Insert: {
          claimed_at?: string
          claimed_by?: string | null
          created_at?: string
          device_identifier?: string | null
          id?: string
          status?: string
          user_id: string
          video_url?: string | null
          welcome_package?: Json
        }
        Update: {
          claimed_at?: string
          claimed_by?: string | null
          created_at?: string
          device_identifier?: string | null
          id?: string
          status?: string
          user_id?: string
          video_url?: string | null
          welcome_package?: Json
        }
        Relationships: []
      }
      wheel_bets: {
        Row: {
          amount: number
          created_at: string
          id: string
          payout: number
          room_id: string | null
          round_id: string
          slot_key: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payout?: number
          room_id?: string | null
          round_id: string
          slot_key: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payout?: number
          room_id?: string | null
          round_id?: string
          slot_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wheel_bets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wheel_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "wheel_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      wheel_rounds: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          round_no: number
          settled_at: string | null
          slots: Json
          started_at: string
          status: string
          winning_key: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          round_no?: number
          settled_at?: string | null
          slots: Json
          started_at?: string
          status?: string
          winning_key?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          round_no?: number
          settled_at?: string | null
          slots?: Json
          started_at?: string
          status?: string
          winning_key?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_end_relationship: {
        Args: { _relationship_id: string }
        Returns: boolean
      }
      admin_set_profile_suspended: {
        Args: { _suspended: boolean; _user_id: string }
        Returns: boolean
      }
      app_cup_leaderboard: {
        Args: { _category: string; _limit?: number; _period?: string }
        Returns: {
          avatar_url: string
          display_name: string
          entity_id: string
          image_url: string
          public_id: string
          score: number
        }[]
      }
      approve_coin_purchase: {
        Args: { _admin: string; _request_id: string }
        Returns: number
      }
      award_gift_badges: { Args: { _user_id: string }; Returns: number }
      create_lucky_bag: {
        Args: {
          _message?: string
          _room_id: string
          _total: number
          _winners: number
        }
        Returns: string
      }
      create_room: {
        Args: {
          _background_url?: string
          _category: string
          _description: string
          _image_url?: string
          _mic_count: number
          _name: string
          _password: string
          _room_type: Database["public"]["Enums"]["room_type"]
        }
        Returns: {
          background_url: string | null
          category: string
          chat_locked: boolean
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_disabled: boolean
          max_users: number
          member_count: number
          mic_count: number
          name: string
          owner_id: string
          password: string | null
          popularity: number
          room_code: string
          room_type: Database["public"]["Enums"]["room_type"]
          theme: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cup_event_leaderboard: {
        Args: { _event_id: string; _limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          entity_id: string
          image_url: string
          public_id: string
          score: number
        }[]
      }
      cup_window_start: { Args: { _period: string }; Returns: string }
      domino_cancel: {
        Args: { _game_id: string; _uid: string }
        Returns: undefined
      }
      domino_credit: {
        Args: { _amount: number; _ref: string; _user_id: string }
        Returns: undefined
      }
      domino_deal: { Args: never; Returns: Json }
      domino_forfeit: {
        Args: { _game_id: string; _uid: string }
        Returns: Json
      }
      domino_has_playable: {
        Args: { seat: string; state: Json }
        Returns: boolean
      }
      domino_join: {
        Args: { _bet: number; _room_id?: string; _uid: string }
        Returns: string
      }
      domino_log: { Args: { entry: Json; state: Json }; Returns: Json }
      domino_move: {
        Args: { _game_id: string; _side: string; _tile: number; _uid: string }
        Returns: Json
      }
      domino_pass: { Args: { _game_id: string; _uid: string }; Returns: Json }
      domino_pips: { Args: { seat: string; state: Json }; Returns: number }
      domino_settings: { Args: never; Returns: Json }
      domino_tile_a: { Args: { t: number }; Returns: number }
      domino_tile_b: { Args: { t: number }; Returns: number }
      end_relationship: { Args: { _relationship_id: string }; Returns: boolean }
      equip_item: {
        Args: { _equip: boolean; _user_item_id: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          cvip_expires_at: string | null
          display_name: string
          frame_url: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_cvip: boolean
          is_online: boolean
          is_suspended: boolean
          last_seen: string
          level: number
          mic_decoration_url: string | null
          profile_background_url: string | null
          public_id: string
          updated_at: string
          vip_expires_at: string | null
          vip_level: number
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_due_vip: { Args: never; Returns: number }
      gen_public_id: { Args: never; Returns: string }
      gen_room_code: { Args: never; Returns: string }
      gift_stats: { Args: { _since?: string }; Returns: Json }
      has_badge_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      lock_relationship_slot: {
        Args: {
          _type: Database["public"]["Enums"]["relation_type"]
          _user_id: string
        }
        Returns: undefined
      }
      mark_direct_messages_read: {
        Args: { _sender_id: string }
        Returns: number
      }
      open_lucky_bag: { Args: { _bag_id: string }; Returns: number }
      purchase_cvip: {
        Args: { _plan_id: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          cvip_expires_at: string | null
          display_name: string
          frame_url: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_cvip: boolean
          is_online: boolean
          is_suspended: boolean
          last_seen: string
          level: number
          mic_decoration_url: string | null
          profile_background_url: string | null
          public_id: string
          updated_at: string
          vip_expires_at: string | null
          vip_level: number
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_item: {
        Args: { _item_id: string }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          is_equipped: boolean
          item_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_vip: {
        Args: { _level: number }
        Returns: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          cvip_expires_at: string | null
          display_name: string
          frame_url: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_cvip: boolean
          is_online: boolean
          is_suspended: boolean
          last_seen: string
          level: number
          mic_decoration_url: string | null
          profile_background_url: string | null
          public_id: string
          updated_at: string
          vip_expires_at: string | null
          vip_level: number
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_item: { Args: { _user_item_id: string }; Returns: number }
      relationship_settings: { Args: never; Returns: Json }
      remove_friend: { Args: { _friend_id: string }; Returns: boolean }
      replace_relationship: {
        Args: {
          _partner_id: string
          _type: Database["public"]["Enums"]["relation_type"]
        }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          partner_id: string
          requester_id: string
          started_at: string | null
          status: string
          type: Database["public"]["Enums"]["relation_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_relationship: {
        Args: {
          _partner_id: string
          _type: Database["public"]["Enums"]["relation_type"]
        }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          partner_id: string
          requester_id: string
          started_at: string | null
          status: string
          type: Database["public"]["Enums"]["relation_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_friend_request: {
        Args: { _accept: boolean; _request_id: string }
        Returns: boolean
      }
      respond_relationship: {
        Args: { _accept: boolean; _relationship_id: string }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          partner_id: string
          requester_id: string
          started_at: string | null
          status: string
          type: Database["public"]["Enums"]["relation_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "relationships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      room_cup_leaderboard: {
        Args: { _limit?: number; _period?: string; _room_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          public_id: string
          score: number
          user_id: string
          vip_level: number
        }[]
      }
      send_direct_gift: {
        Args: { _gift_id: string; _quantity?: number; _receiver_id: string }
        Returns: {
          created_at: string
          gift_id: string
          id: string
          quantity: number
          receiver_id: string
          room_id: string | null
          sender_id: string
          total_price: number
        }
        SetofOptions: {
          from: "*"
          to: "gift_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_friend_request: {
        Args: { _addressee_id: string }
        Returns: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friend_status"]
        }
        SetofOptions: {
          from: "*"
          to: "friend_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_gift: {
        Args: {
          _gift_id: string
          _quantity?: number
          _receiver_id: string
          _room_id: string
        }
        Returns: {
          created_at: string
          gift_id: string
          id: string
          quantity: number
          receiver_id: string
          room_id: string | null
          sender_id: string
          total_price: number
        }
        SetofOptions: {
          from: "*"
          to: "gift_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_gift_bulk: {
        Args: {
          _gift_id: string
          _quantity?: number
          _receiver_ids: string[]
          _room_id?: string
        }
        Returns: Json
      }
      send_room_message: {
        Args: { _body: string; _room_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          room_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "room_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_cup_event: {
        Args: { _admin: string; _event_id: string }
        Returns: number
      }
      settle_game: {
        Args: {
          _bet: number
          _label: string
          _payout: number
          _user_id: string
        }
        Returns: number
      }
      setup_account: {
        Args: {
          _avatar_url: string
          _bio?: string
          _birth_date: string
          _city: string
          _country: string
          _display_name: string
          _gender: Database["public"]["Enums"]["gender_type"]
        }
        Returns: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          cvip_expires_at: string | null
          display_name: string
          frame_url: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_cvip: boolean
          is_online: boolean
          is_suspended: boolean
          last_seen: string
          level: number
          mic_decoration_url: string | null
          profile_background_url: string | null
          public_id: string
          updated_at: string
          vip_expires_at: string | null
          vip_level: number
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      suppress_duplicate_role_notification_marker: {
        Args: never
        Returns: undefined
      }
      take_mic: {
        Args: { _room_id: string; _seat: number }
        Returns: {
          decoration_url: string | null
          id: string
          is_locked: boolean
          is_muted: boolean
          room_id: string
          seat_index: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "room_mics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wheel_bet: {
        Args: { _amount: number; _room_id?: string; _slot_key: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          payout: number
          room_id: string | null
          round_id: string
          slot_key: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wheel_bets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wheel_settings: { Args: never; Returns: Json }
      wheel_settle: { Args: { _round_id: string }; Returns: undefined }
      wheel_tick: {
        Args: never
        Returns: {
          created_at: string
          ends_at: string
          id: string
          round_no: number
          settled_at: string | null
          slots: Json
          started_at: string
          status: string
          winning_key: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wheel_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "moderator"
        | "host"
        | "user"
        | "welcome_manager"
      friend_status: "pending" | "accepted" | "rejected"
      gender_type: "male" | "female"
      relation_type: "couple" | "soulmate" | "favorite_friend" | "close_friend"
      room_type: "public" | "private"
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
      app_role: [
        "super_admin",
        "admin",
        "moderator",
        "host",
        "user",
        "welcome_manager",
      ],
      friend_status: ["pending", "accepted", "rejected"],
      gender_type: ["male", "female"],
      relation_type: ["couple", "soulmate", "favorite_friend", "close_friend"],
      room_type: ["public", "private"],
    },
  },
} as const
