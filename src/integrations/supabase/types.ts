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
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          rarity: string
          sort_order: number
          sound_url: string | null
          updated_at: string
        }
        Insert: {
          animation_url?: string | null
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          rarity?: string
          sort_order?: number
          sound_url?: string | null
          updated_at?: string
        }
        Update: {
          animation_url?: string | null
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          rarity?: string
          sort_order?: number
          sound_url?: string | null
          updated_at?: string
        }
        Relationships: []
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
          profile_background_url: string | null
          public_id: string
          updated_at: string
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
          profile_background_url?: string | null
          public_id: string
          updated_at?: string
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
          profile_background_url?: string | null
          public_id?: string
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_room: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
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
          profile_background_url: string | null
          public_id: string
          updated_at: string
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
      gen_public_id: { Args: never; Returns: string }
      gen_room_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
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
          profile_background_url: string | null
          public_id: string
          updated_at: string
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
          profile_background_url: string | null
          public_id: string
          updated_at: string
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
    }
    Enums: {
      app_role: "super_admin" | "admin" | "moderator" | "host" | "user"
      friend_status: "pending" | "accepted" | "rejected"
      gender_type: "male" | "female"
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
      app_role: ["super_admin", "admin", "moderator", "host", "user"],
      friend_status: ["pending", "accepted", "rejected"],
      gender_type: ["male", "female"],
      room_type: ["public", "private"],
    },
  },
} as const
