export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          avatar: string
          color: string
          location: string | null
          bio: string | null
          project: string | null
          skills: string[]
          looking_for: string[]
          github: string | null
          website: string | null
          twitter: string | null
          primary_lang: string
          open_to_collab: boolean
          // FIX: was missing from all three shapes — caused as-any casts throughout codebase
          profile_complete: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          avatar: string
          color?: string
          location?: string | null
          bio?: string | null
          project?: string | null
          skills?: string[]
          looking_for?: string[]
          github?: string | null
          website?: string | null
          twitter?: string | null
          primary_lang?: string
          open_to_collab?: boolean
          profile_complete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          avatar?: string
          color?: string
          location?: string | null
          bio?: string | null
          project?: string | null
          skills?: string[]
          looking_for?: string[]
          github?: string | null
          website?: string | null
          twitter?: string | null
          primary_lang?: string
          open_to_collab?: boolean
          profile_complete?: boolean
          updated_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          user_id: string
          content: string
          tag: string
          image_url: string | null
          video_url: string | null
          likes: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content: string
          tag: string
          image_url?: string | null
          video_url?: string | null
          likes?: number
          created_at?: string
        }
        Update: {
          content?: string
          tag?: string
          image_url?: string | null
          video_url?: string | null
          likes?: number
        }
      }
      post_likes: {
        Row: { id: string; user_id: string; post_id: string; created_at: string }
        Insert: { user_id: string; post_id: string }
        Update: Record<string, never>
      }
      comments: {
        Row: {
          id: string
          post_id: string
          user_id: string
          text: string
          created_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          text: string
        }
        Update: { text?: string }
      }
      collabs: {
        Row: {
          id: string
          user_id: string
          title: string
          looking: string
          description: string
          skills: string[]
          image_url: string | null
          video_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          looking: string
          description: string
          skills?: string[]
          image_url?: string | null
          video_url?: string | null
        }
        Update: {
          title?: string
          looking?: string
          description?: string
          skills?: string[]
          image_url?: string | null
          video_url?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          text: string | null
          media_url: string | null
          media_type: string | null
          created_at: string
          read: boolean
        }
        Insert: {
          sender_id: string
          receiver_id: string
          text?: string | null
          media_url?: string | null
          media_type?: string | null
          read?: boolean
        }
        Update: { read?: boolean }
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string
          bio: string
          emoji: string
          topic: string
          visibility: string
          owner_id: string
          member_count: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description: string
          bio: string
          emoji: string
          topic: string
          visibility: string
          owner_id: string
          member_count?: number
        }
        Update: {
          name?: string
          description?: string
          bio?: string
          emoji?: string
          topic?: string
          visibility?: string
          member_count?: number
        }
      }
      group_members: {
        Row: { id: string; group_id: string; user_id: string; role: string; banned: boolean; joined_at: string }
        Insert: { group_id: string; user_id: string; role?: string; banned?: boolean }
        Update: { role?: string; banned?: boolean }
      }
      group_messages: {
        Row: {
          id: string
          group_id: string
          user_id: string
          text: string | null
          media_url: string | null
          media_type: string | null
          created_at: string
          edited: boolean
          edited_at: string | null
        }
        Insert: {
          group_id: string
          user_id: string
          text?: string | null
          media_url?: string | null
          media_type?: string | null
          edited?: boolean
          edited_at?: string | null
        }
        Update: { text?: string; edited?: boolean; edited_at?: string | null }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          text: string
          subtext: string | null
          read: boolean
          action: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          type: string
          text: string
          subtext?: string | null
          read?: boolean
          action?: string | null
        }
        Update: { read?: boolean }
      }
      connections: {
        Row: {
          id: string
          requester_id: string
          receiver_id: string
          status: string
          created_at: string
        }
        Insert: {
          requester_id: string
          receiver_id: string
          status?: string
        }
        Update: { status?: string }
      }
      saved_posts: {
        Row: { user_id: string; post_id: string; created_at: string }
        Insert: { user_id: string; post_id: string }
        Update: Record<string, never>
      }
      saved_collabs: {
        Row: { user_id: string; collab_id: string; created_at: string }
        Insert: { user_id: string; collab_id: string }
        Update: Record<string, never>
      }
      collab_interests: {
        Row: { user_id: string; collab_id: string; created_at: string }
        Insert: { user_id: string; collab_id: string }
        Update: Record<string, never>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
