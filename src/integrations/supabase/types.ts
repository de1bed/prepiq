export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      clock_logs: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          restaurant_id: string
          session_id: string
          status: Database["public"]["Enums"]["clock_status"]
          timestamp: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          restaurant_id: string
          session_id: string
          status: Database["public"]["Enums"]["clock_status"]
          timestamp?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          restaurant_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["clock_status"]
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "daily_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          is_active: boolean
          restaurant_id: string
          session_date: string
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          restaurant_id: string
          session_date: string
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          restaurant_id?: string
          session_date?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          current_quantity: number
          id: string
          ingredient_name: string
          last_updated_at: string
          min_threshold: number | null
          restaurant_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          current_quantity?: number
          id?: string
          ingredient_name: string
          last_updated_at?: string
          min_threshold?: number | null
          restaurant_id: string
          unit: string
        }
        Update: {
          created_at?: string
          current_quantity?: number
          id?: string
          ingredient_name?: string
          last_updated_at?: string
          min_threshold?: number | null
          restaurant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          modifications: string[] | null
          order_id: string
          quantity: number
          recipe_id: string
          station_assignments: Database["public"]["Enums"]["station_type"][]
        }
        Insert: {
          created_at?: string
          id?: string
          modifications?: string[] | null
          order_id: string
          quantity?: number
          recipe_id: string
          station_assignments?: Database["public"]["Enums"]["station_type"][]
        }
        Update: {
          created_at?: string
          id?: string
          modifications?: string[] | null
          order_id?: string
          quantity?: number
          recipe_id?: string
          station_assignments?: Database["public"]["Enums"]["station_type"][]
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          order_number: number
          ordered_at: string
          restaurant_id: string
          server_id: string | null
          session_id: string
          special_instructions: string | null
          stations: Database["public"]["Enums"]["station_type"][]
          status: Database["public"]["Enums"]["order_status"]
          table_number: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          order_number: number
          ordered_at?: string
          restaurant_id: string
          server_id?: string | null
          session_id: string
          special_instructions?: string | null
          stations?: Database["public"]["Enums"]["station_type"][]
          status?: Database["public"]["Enums"]["order_status"]
          table_number?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          order_number?: number
          ordered_at?: string
          restaurant_id?: string
          server_id?: string | null
          session_id?: string
          special_instructions?: string | null
          stations?: Database["public"]["Enums"]["station_type"][]
          status?: Database["public"]["Enums"]["order_status"]
          table_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "daily_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_availability: {
        Row: {
          available_batches: number
          created_at: string
          id: string
          last_updated_at: string
          recipe_id: string
          restaurant_id: string
          session_id: string
        }
        Insert: {
          available_batches?: number
          created_at?: string
          id?: string
          last_updated_at?: string
          recipe_id: string
          restaurant_id: string
          session_id: string
        }
        Update: {
          available_batches?: number
          created_at?: string
          id?: string
          last_updated_at?: string
          recipe_id?: string
          restaurant_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_availability_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_availability_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_availability_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "daily_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_logs: {
        Row: {
          batch_quantity: number
          container_info: string | null
          created_at: string
          employee_id: string
          id: string
          recipe_id: string
          restaurant_id: string
          session_id: string
        }
        Insert: {
          batch_quantity: number
          container_info?: string | null
          created_at?: string
          employee_id: string
          id?: string
          recipe_id: string
          restaurant_id: string
          session_id: string
        }
        Update: {
          batch_quantity?: number
          container_info?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          recipe_id?: string
          restaurant_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "daily_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          employee_number: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          restaurant_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_number: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          restaurant_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          employee_number?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_dependencies: {
        Row: {
          child_recipe_id: string
          created_at: string
          id: string
          parent_recipe_id: string
          quantity_needed: number
          unit: string
        }
        Insert: {
          child_recipe_id: string
          created_at?: string
          id?: string
          parent_recipe_id: string
          quantity_needed?: number
          unit?: string
        }
        Update: {
          child_recipe_id?: string
          created_at?: string
          id?: string
          parent_recipe_id?: string
          quantity_needed?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_dependencies_child_recipe_id_fkey"
            columns: ["child_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_dependencies_parent_recipe_id_fkey"
            columns: ["parent_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_name: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_name: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_name?: string
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          batch_size: number
          category: string
          cook_time_minutes: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          prep_time_minutes: number | null
          recipe_type: string
          restaurant_id: string
          stations: Database["public"]["Enums"]["station_type"][]
          updated_at: string
        }
        Insert: {
          batch_size?: number
          category: string
          cook_time_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          prep_time_minutes?: number | null
          recipe_type?: string
          restaurant_id: string
          stations?: Database["public"]["Enums"]["station_type"][]
          updated_at?: string
        }
        Update: {
          batch_size?: number
          category?: string
          cook_time_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prep_time_minutes?: number | null
          recipe_type?: string
          restaurant_id?: string
          stations?: Database["public"]["Enums"]["station_type"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_restaurant: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      clock_status: "clocked_in" | "on_break" | "clocked_out"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "delivered"
        | "cancelled"
      station_type: "grill" | "fry" | "salads" | "broiler" | "prep"
      user_role: "manager" | "server" | "prep" | "cook" | "admin"
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
      clock_status: ["clocked_in", "on_break", "clocked_out"],
      order_status: ["pending", "preparing", "ready", "delivered", "cancelled"],
      station_type: ["grill", "fry", "salads", "broiler", "prep"],
      user_role: ["manager", "server", "prep", "cook", "admin"],
    },
  },
} as const
