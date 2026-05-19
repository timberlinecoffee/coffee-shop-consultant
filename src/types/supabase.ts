// Auto-generated from schema + TIM-629 copilot_v1 migration.
// Regenerate with: supabase gen types typescript --local > src/types/supabase.ts

export type WorkspaceKey =
  | 'concept'
  | 'location_lease'
  | 'financials'
  | 'menu_pricing'
  | 'buildout_equipment'
  | 'launch_plan'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          signup_source: string | null
          subscription_status: 'free_trial' | 'active' | 'cancelled' | 'expired'
          subscription_tier: 'free' | 'starter' | 'growth' | 'pro'
          ai_credits_remaining: number
          target_opening_date: string | null
          readiness_score: number
          onboarding_completed: boolean
          onboarding_data: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          signup_source?: string | null
          subscription_status?: 'free_trial' | 'active' | 'cancelled' | 'expired'
          subscription_tier?: 'free' | 'starter' | 'growth' | 'pro'
          ai_credits_remaining?: number
          target_opening_date?: string | null
          readiness_score?: number
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          signup_source?: string | null
          subscription_status?: 'free_trial' | 'active' | 'cancelled' | 'expired'
          subscription_tier?: 'free' | 'starter' | 'growth' | 'pro'
          ai_credits_remaining?: number
          target_opening_date?: string | null
          readiness_score?: number
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      coffee_shop_plans: {
        Row: {
          id: string
          user_id: string
          plan_name: string
          current_module: number
          status: 'in_progress' | 'completed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan_name?: string
          current_module?: number
          status?: 'in_progress' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          plan_name?: string
          current_module?: number
          status?: 'in_progress' | 'completed'
          created_at?: string
          updated_at?: string
        }
      }
      module_responses: {
        Row: {
          id: string
          plan_id: string
          module_number: number
          section_key: string
          response_data: Json
          ai_feedback: Json
          status: 'not_started' | 'in_progress' | 'completed'
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          module_number: number
          section_key: string
          response_data?: Json
          ai_feedback?: Json
          status?: 'not_started' | 'in_progress' | 'completed'
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          module_number?: number
          section_key?: string
          response_data?: Json
          ai_feedback?: Json
          status?: 'not_started' | 'in_progress' | 'completed'
          updated_at?: string
        }
      }
      ai_conversations: {
        Row: {
          id: string
          plan_id: string
          messages: Json
          credits_used: number
          cost_usd: number | null
          created_at: string
          updated_at: string
          workspace_key: WorkspaceKey | null
          thread_id: string | null
          title: string | null
          last_message_at: string | null
          model_used: string | null
        }
        Insert: {
          id?: string
          plan_id: string
          messages?: Json
          credits_used?: number
          cost_usd?: number | null
          created_at?: string
          updated_at?: string
          workspace_key?: WorkspaceKey | null
          thread_id?: string | null
          title?: string | null
          last_message_at?: string | null
          model_used?: string | null
        }
        Update: {
          id?: string
          plan_id?: string
          messages?: Json
          credits_used?: number
          cost_usd?: number | null
          created_at?: string
          updated_at?: string
          workspace_key?: WorkspaceKey | null
          thread_id?: string | null
          title?: string | null
          last_message_at?: string | null
          model_used?: string | null
        }
      }
      workspace_documents: {
        Row: {
          id: string
          plan_id: string
          workspace_key: WorkspaceKey
          content: Json
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          workspace_key: WorkspaceKey
          content?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          workspace_key?: WorkspaceKey
          content?: Json
          updated_at?: string
        }
      }
      ai_errors: {
        Row: {
          id: number
          user_id: string | null
          workspace_key: WorkspaceKey | null
          error_code: string
          upstream_status: number | null
          request_id: string | null
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id?: string | null
          workspace_key?: WorkspaceKey | null
          error_code: string
          upstream_status?: number | null
          request_id?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string | null
          workspace_key?: WorkspaceKey | null
          error_code?: string
          upstream_status?: number | null
          request_id?: string | null
          details?: Json | null
          created_at?: string
        }
      }
      equipment_lists: {
        Row: {
          id: string
          plan_id: string
          items: Json
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          items?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          items?: Json
          updated_at?: string
        }
      }
      financial_models: {
        Row: {
          id: string
          plan_id: string
          startup_costs: Json
          monthly_projections: Json
          revenue_scenarios: Json
          break_even_analysis: Json
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          startup_costs?: Json
          monthly_projections?: Json
          revenue_scenarios?: Json
          break_even_analysis?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          startup_costs?: Json
          monthly_projections?: Json
          revenue_scenarios?: Json
          break_even_analysis?: Json
          updated_at?: string
        }
      }
      cost_tracker: {
        Row: {
          id: string
          plan_id: string
          item_name: string
          category: 'buildout' | 'equipment' | 'inventory' | 'licenses' | 'marketing' | 'other'
          projected_cost: number
          actual_cost: number | null
          status: 'planned' | 'purchased' | 'paid'
          date_incurred: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          item_name: string
          category: 'buildout' | 'equipment' | 'inventory' | 'licenses' | 'marketing' | 'other'
          projected_cost?: number
          actual_cost?: number | null
          status?: 'planned' | 'purchased' | 'paid'
          date_incurred?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          item_name?: string
          category?: 'buildout' | 'equipment' | 'inventory' | 'licenses' | 'marketing' | 'other'
          projected_cost?: number
          actual_cost?: number | null
          status?: 'planned' | 'purchased' | 'paid'
          date_incurred?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      milestones: {
        Row: {
          id: string
          plan_id: string
          title: string
          description: string | null
          target_date: string
          completed_at: string | null
          module_number: number | null
          is_auto_generated: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          title: string
          description?: string | null
          target_date: string
          completed_at?: string | null
          module_number?: number | null
          is_auto_generated?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          title?: string
          description?: string | null
          target_date?: string
          completed_at?: string | null
          module_number?: number | null
          is_auto_generated?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      menu_items: {
        Row: {
          id: string
          plan_id: string
          name: string
          category: 'espresso' | 'brewed' | 'food' | 'retail' | 'seasonal'
          recipe: Json
          cogs: number
          price: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          name: string
          category: 'espresso' | 'brewed' | 'food' | 'retail' | 'seasonal'
          recipe?: Json
          cogs?: number
          price?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          name?: string
          category?: 'espresso' | 'brewed' | 'food' | 'retail' | 'seasonal'
          recipe?: Json
          cogs?: number
          price?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vendors: {
        Row: {
          id: string
          plan_id: string
          company_name: string
          category: 'roaster' | 'equipment' | 'contractor' | 'pos' | 'insurance' | 'other'
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          website: string | null
          notes: string | null
          status: 'researching' | 'contacted' | 'quoted' | 'selected' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          company_name: string
          category: 'roaster' | 'equipment' | 'contractor' | 'pos' | 'insurance' | 'other'
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          website?: string | null
          notes?: string | null
          status?: 'researching' | 'contacted' | 'quoted' | 'selected' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          company_name?: string
          category?: 'roaster' | 'equipment' | 'contractor' | 'pos' | 'insurance' | 'other'
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          website?: string | null
          notes?: string | null
          status?: 'researching' | 'contacted' | 'quoted' | 'selected' | 'rejected'
          created_at?: string
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: 'starter' | 'growth' | 'pro'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_start: string | null
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: 'starter' | 'growth' | 'pro'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: 'starter' | 'growth' | 'pro'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      credit_transactions: {
        Row: {
          id: string
          user_id: string
          amount: number
          type: 'monthly_allocation' | 'purchase' | 'usage'
          description: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          type: 'monthly_allocation' | 'purchase' | 'usage'
          description: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          type?: 'monthly_allocation' | 'purchase' | 'usage'
          description?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
