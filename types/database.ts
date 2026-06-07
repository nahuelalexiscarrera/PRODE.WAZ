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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievement_catalog: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category_t"]
          description: string
          icon_ref: string
          id: string
          name: string
          points_bonus: number
          trigger_key: string
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category_t"]
          description: string
          icon_ref: string
          id: string
          name: string
          points_bonus?: number
          trigger_key: string
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category_t"]
          description?: string
          icon_ref?: string
          id?: string
          name?: string
          points_bonus?: number
          trigger_key?: string
        }
        Relationships: []
      }
      brand: {
        Row: {
          created_at: string
          created_by: string | null
          hashtag_suffix: string
          id: string
          logo_url: string | null
          name: string
          short_name: string | null
          slug: string
          status: Database["public"]["Enums"]["brand_status_t"]
          sub_brand: string | null
          theme_slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hashtag_suffix: string
          id?: string
          logo_url?: string | null
          name: string
          short_name?: string | null
          slug: string
          status?: Database["public"]["Enums"]["brand_status_t"]
          sub_brand?: string | null
          theme_slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hashtag_suffix?: string
          id?: string
          logo_url?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["brand_status_t"]
          sub_brand?: string | null
          theme_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_theme_slug_fkey"
            columns: ["theme_slug"]
            isOneToOne: false
            referencedRelation: "theme"
            referencedColumns: ["slug"]
          },
        ]
      }
      brand_admin: {
        Row: {
          brand_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_admin_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_admin_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_admin_invite: {
        Row: {
          brand_id: string
          consumed_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
        }
        Insert: {
          brand_id: string
          consumed_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
        }
        Update: {
          brand_id?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_admin_invite_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      comment: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          post_id: string
          reaction_count: number
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id: string
          reaction_count?: number
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id?: string
          reaction_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      error_event: {
        Row: {
          count: number
          fingerprint: string
          first_seen: string
          id: string
          jira_issue_key: string | null
          jira_url: string | null
          kind: string
          last_seen: string
          message: string
          route: string | null
          sample_stack: string | null
          status: string
        }
        Insert: {
          count?: number
          fingerprint: string
          first_seen?: string
          id?: string
          jira_issue_key?: string | null
          jira_url?: string | null
          kind: string
          last_seen?: string
          message: string
          route?: string | null
          sample_stack?: string | null
          status?: string
        }
        Update: {
          count?: number
          fingerprint?: string
          first_seen?: string
          id?: string
          jira_issue_key?: string | null
          jira_url?: string | null
          kind?: string
          last_seen?: string
          message?: string
          route?: string | null
          sample_stack?: string | null
          status?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          letter: string
          tournament_id: string
        }
        Insert: {
          id: string
          letter: string
          tournament_id: string
        }
        Update: {
          id?: string
          letter?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_code: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          used: boolean
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          used?: boolean
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          used?: boolean
          used_by?: string | null
        }
        Relationships: []
      }
      match: {
        Row: {
          away_code: string
          created_at: string
          fd_id: number | null
          group_id: string | null
          home_code: string
          id: string
          kickoff_at: string
          phase: Database["public"]["Enums"]["phase_t"]
          status: Database["public"]["Enums"]["match_status_t"]
          tournament_id: string
          venue_city: string | null
        }
        Insert: {
          away_code: string
          created_at?: string
          fd_id?: number | null
          group_id?: string | null
          home_code: string
          id?: string
          kickoff_at: string
          phase: Database["public"]["Enums"]["phase_t"]
          status?: Database["public"]["Enums"]["match_status_t"]
          tournament_id: string
          venue_city?: string | null
        }
        Update: {
          away_code?: string
          created_at?: string
          fd_id?: number | null
          group_id?: string | null
          home_code?: string
          id?: string
          kickoff_at?: string
          phase?: Database["public"]["Enums"]["phase_t"]
          status?: Database["public"]["Enums"]["match_status_t"]
          tournament_id?: string
          venue_city?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_away_code_fkey"
            columns: ["away_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "match_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_home_code_fkey"
            columns: ["home_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "match_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      match_result: {
        Row: {
          away_score: number
          finished_at: string
          home_score: number
          match_id: string
          top_scorer_player_id: string | null
        }
        Insert: {
          away_score: number
          finished_at?: string
          home_score: number
          match_id: string
          top_scorer_player_id?: string | null
        }
        Update: {
          away_score?: number
          finished_at?: string
          home_score?: number
          match_id?: string
          top_scorer_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_result_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "match"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_top_scorer_player_id_fkey"
            columns: ["top_scorer_player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          body: string
          created_at: string
          deep_link: string
          id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type_t"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deep_link: string
          id?: string
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type_t"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deep_link?: string
          id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type_t"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      player: {
        Row: {
          full_name: string
          id: string
          name: string
          team_code: string
        }
        Insert: {
          full_name: string
          id?: string
          name: string
          team_code: string
        }
        Update: {
          full_name?: string
          id?: string
          name?: string
          team_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_team_code_fkey"
            columns: ["team_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
        ]
      }
      post: {
        Row: {
          body: string
          brand_id: string
          comment_count: number
          created_at: string
          deleted_at: string | null
          embed_ref_id: string | null
          embed_type: string | null
          id: string
          image_height: number | null
          image_url: string | null
          image_width: number | null
          reaction_count: number
          user_id: string
        }
        Insert: {
          body: string
          brand_id: string
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          embed_ref_id?: string | null
          embed_type?: string | null
          id?: string
          image_height?: number | null
          image_url?: string | null
          image_width?: number | null
          reaction_count?: number
          user_id: string
        }
        Update: {
          body?: string
          brand_id?: string
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          embed_ref_id?: string | null
          embed_type?: string | null
          id?: string
          image_height?: number | null
          image_url?: string | null
          image_width?: number | null
          reaction_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction: {
        Row: {
          away_score: number
          brand_id: string
          created_at: string
          home_score: number
          id: string
          match_id: string
          points_breakdown: Json | null
          points_earned: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          away_score: number
          brand_id: string
          created_at?: string
          home_score: number
          id?: string
          match_id: string
          points_breakdown?: Json | null
          points_earned?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          away_score?: number
          brand_id?: string
          created_at?: string
          home_score?: number
          id?: string
          match_id?: string
          points_breakdown?: Json | null
          points_earned?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscription: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscription_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_snapshot: {
        Row: {
          brand_id: string
          entries: Json
          id: string
          snapshot_at: string
          tournament_id: string
          week_number: number
        }
        Insert: {
          brand_id: string
          entries: Json
          id?: string
          snapshot_at?: string
          tournament_id: string
          week_number: number
        }
        Update: {
          brand_id?: string
          entries?: Json
          id?: string
          snapshot_at?: string
          tournament_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshot_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_snapshot_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      reaction: {
        Row: {
          created_at: string
          target_id: string
          target_type: Database["public"]["Enums"]["reaction_target_t"]
          user_id: string
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: Database["public"]["Enums"]["reaction_target_t"]
          user_id: string
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["reaction_target_t"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      share_intent: {
        Row: {
          channel: Database["public"]["Enums"]["share_channel_t"]
          context_id: string | null
          created_at: string
          id: string
          template: Database["public"]["Enums"]["share_template_t"]
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["share_channel_t"]
          context_id?: string | null
          created_at?: string
          id?: string
          template: Database["public"]["Enums"]["share_template_t"]
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["share_channel_t"]
          context_id?: string | null
          created_at?: string
          id?: string
          template?: Database["public"]["Enums"]["share_template_t"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_intent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      special_prediction: {
        Row: {
          brand_id: string
          champion_code: string
          created_at: string
          group_stage_best_code: string
          locked_at: string | null
          points_earned: number | null
          revelation_code: string
          runner_up_code: string
          top_scorer_player_id: string | null
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          champion_code: string
          created_at?: string
          group_stage_best_code: string
          locked_at?: string | null
          points_earned?: number | null
          revelation_code: string
          runner_up_code: string
          top_scorer_player_id?: string | null
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          champion_code?: string
          created_at?: string
          group_stage_best_code?: string
          locked_at?: string | null
          points_earned?: number | null
          revelation_code?: string
          runner_up_code?: string
          top_scorer_player_id?: string | null
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_prediction_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_prediction_champion_code_fkey"
            columns: ["champion_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "special_prediction_group_stage_best_code_fkey"
            columns: ["group_stage_best_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "special_prediction_revelation_code_fkey"
            columns: ["revelation_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "special_prediction_runner_up_code_fkey"
            columns: ["runner_up_code"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "special_prediction_top_scorer_player_id_fkey"
            columns: ["top_scorer_player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_prediction_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_prediction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket: {
        Row: {
          area: string | null
          created_at: string
          description: string
          id: string
          jira_issue_key: string | null
          jira_url: string | null
          reporter_id: string | null
          severity: string
          status: string
          ticket_number: string
          title: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          description: string
          id?: string
          jira_issue_key?: string | null
          jira_url?: string | null
          reporter_id?: string | null
          severity?: string
          status?: string
          ticket_number?: string
          title: string
        }
        Update: {
          area?: string | null
          created_at?: string
          description?: string
          id?: string
          jira_issue_key?: string | null
          jira_url?: string | null
          reporter_id?: string | null
          severity?: string
          status?: string
          ticket_number?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      team: {
        Row: {
          code: string
          group_id: string | null
          name: string
        }
        Insert: {
          code: string
          group_id?: string | null
          name: string
        }
        Update: {
          code?: string
          group_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      theme: {
        Row: {
          created_at: string
          name: string
          slug: string
          tokens: Json
        }
        Insert: {
          created_at?: string
          name: string
          slug: string
          tokens: Json
        }
        Update: {
          created_at?: string
          name?: string
          slug?: string
          tokens?: Json
        }
        Relationships: []
      }
      tournament: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          end_date: string
          id: string
          phase_config: Json
          short_name: string
          slug: string
          start_date: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          end_date: string
          id?: string
          phase_config: Json
          short_name: string
          slug: string
          start_date: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          end_date?: string
          id?: string
          phase_config?: Json
          short_name?: string
          slug?: string
          start_date?: string
        }
        Relationships: []
      }
      user: {
        Row: {
          avatar_url: string | null
          brand_id: string
          deleted_at: string | null
          email: string
          id: string
          initials: string
          invite_code_used: string | null
          is_admin: boolean
          joined_at: string
          level: Database["public"]["Enums"]["user_level_t"]
          name: string
          notification_prefs: Json
          phone: string | null
          position: number
          position_last_week: number | null
          referral_code: string | null
          referred_by: string | null
          role: Database["public"]["Enums"]["user_role_t"]
          total_points: number
          visibility: Database["public"]["Enums"]["visibility_t"]
        }
        Insert: {
          avatar_url?: string | null
          brand_id: string
          deleted_at?: string | null
          email: string
          id: string
          initials: string
          invite_code_used?: string | null
          is_admin?: boolean
          joined_at?: string
          level?: Database["public"]["Enums"]["user_level_t"]
          name: string
          notification_prefs?: Json
          phone?: string | null
          position?: number
          position_last_week?: number | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role_t"]
          total_points?: number
          visibility?: Database["public"]["Enums"]["visibility_t"]
        }
        Update: {
          avatar_url?: string | null
          brand_id?: string
          deleted_at?: string | null
          email?: string
          id?: string
          initials?: string
          invite_code_used?: string | null
          is_admin?: boolean
          joined_at?: string
          level?: Database["public"]["Enums"]["user_level_t"]
          name?: string
          notification_prefs?: Json
          phone?: string | null
          position?: number
          position_last_week?: number | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role_t"]
          total_points?: number
          visibility?: Database["public"]["Enums"]["visibility_t"]
        }
        Relationships: [
          {
            foreignKeyName: "user_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invite_code_used_fkey"
            columns: ["invite_code_used"]
            isOneToOne: false
            referencedRelation: "invite_code"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievement: {
        Row: {
          achievement_id: string
          progress: number | null
          shared: boolean
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          progress?: number | null
          shared?: boolean
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          progress?: number | null
          shared?: boolean
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievement_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievement_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievement_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_brand_id: { Args: never; Returns: string }
      fn_add_points: {
        Args: { p_delta: number; p_user_id: string }
        Returns: undefined
      }
      fn_calculate_points: {
        Args: { p_prediction_id: string }
        Returns: number
      }
      fn_ranking_for_brand: {
        Args: { p_brand_id: string; p_limit?: number }
        Returns: {
          avatar_url: string
          initials: string
          level: Database["public"]["Enums"]["user_level_t"]
          points: number
          position: number
          user_id: string
          user_name: string
        }[]
      }
      fn_recalculate_positions:
        | { Args: never; Returns: undefined }
        | { Args: { p_brand_id: string }; Returns: undefined }
      fn_recalculate_positions_all: { Args: never; Returns: undefined }
      fn_record_error: {
        Args: {
          p_fingerprint: string
          p_kind: string
          p_message: string
          p_route: string
          p_stack: string
        }
        Returns: {
          ev_count: number
          is_new: boolean
        }[]
      }
      fn_refresh_views: { Args: never; Returns: undefined }
      fn_resettle_match: { Args: { p_match_id: string }; Returns: undefined }
      fn_settle_match: { Args: { p_match_id: string }; Returns: undefined }
      fn_user_summary_for_brand: {
        Args: { p_brand_id: string }
        Returns: {
          avatar_url: string
          champion_code: string
          initials: string
          level: Database["public"]["Enums"]["user_level_t"]
          position: number
          runner_up_code: string
          top_scorer_name: string
          top_scorer_player_id: string
          top_scorer_team: string
          total_points: number
          user_id: string
          user_name: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_brand_admin: { Args: { p_brand_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      achievement_category_t: "skill" | "consistency" | "social" | "position"
      brand_status_t: "active" | "inactive"
      match_status_t: "scheduled" | "live" | "finished" | "postponed"
      notification_type_t:
        | "onboarding-incomplete"
        | "match-upcoming"
        | "phase-start"
        | "match-result"
        | "reaction"
        | "comment"
        | "achievement-unlocked"
        | "close-to-podium"
        | "position-change"
        | "weekly-digest"
        | "tournament-end"
        | "share-reminder"
      phase_t:
        | "groups"
        | "round-of-32"
        | "round-of-16"
        | "quarter"
        | "semi"
        | "final"
      reaction_target_t: "post" | "comment"
      share_channel_t: "instagram" | "whatsapp" | "download" | "more"
      share_template_t: "summary" | "position" | "match" | "achievement"
      user_level_t: "1" | "2" | "3" | "4" | "5"
      user_role_t: "member" | "brand_admin" | "super_admin"
      visibility_t: "public" | "private"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      achievement_category_t: ["skill", "consistency", "social", "position"],
      brand_status_t: ["active", "inactive"],
      match_status_t: ["scheduled", "live", "finished", "postponed"],
      notification_type_t: [
        "onboarding-incomplete",
        "match-upcoming",
        "phase-start",
        "match-result",
        "reaction",
        "comment",
        "achievement-unlocked",
        "close-to-podium",
        "position-change",
        "weekly-digest",
        "tournament-end",
        "share-reminder",
      ],
      phase_t: [
        "groups",
        "round-of-32",
        "round-of-16",
        "quarter",
        "semi",
        "final",
      ],
      reaction_target_t: ["post", "comment"],
      share_channel_t: ["instagram", "whatsapp", "download", "more"],
      share_template_t: ["summary", "position", "match", "achievement"],
      user_level_t: ["1", "2", "3", "4", "5"],
      user_role_t: ["member", "brand_admin", "super_admin"],
      visibility_t: ["public", "private"],
    },
  },
} as const
