// Auto-generated from schema + TIM-629 copilot_v1 migration + TIM-731 launch_plan_workspace + TIM-866 copilot_trial_messages + TIM-925 beta_waiver.
// Regenerate with: supabase gen types typescript --local > src/types/supabase.ts

// TIM-1458: 'inventory' removed — Supplies is now a page inside the
// Equipment & Supplies suite under the 'buildout_equipment' workspace key.
// Legacy DB rows with workspace_key='inventory' (if any) are left untouched
// and read as orphans by the app.
export type WorkspaceKey =
  | 'concept'
  | 'location_lease'
  | 'financials'
  | 'menu_pricing'
  | 'buildout_equipment'
  | 'opening_month_plan'
  | 'hiring'
  | 'marketing'
  | 'suppliers'
  | 'operations_playbook'
  | 'benchmarks'
  | 'business_plan'

export type LaunchItemStatus = 'pending' | 'in_progress' | 'done' | 'at_risk'

export type HiringRoleStatus = 'planned' | 'posted' | 'interviewing' | 'hired'

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
          subscription_status: 'free_trial' | 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
          subscription_tier: 'free' | 'starter' | 'pro'
          ai_credits_remaining: number
          copilot_trial_messages_used: number
          beta_waiver_until: string | null
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
          subscription_status?: 'free_trial' | 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
          subscription_tier?: 'free' | 'starter' | 'pro'
          ai_credits_remaining?: number
          copilot_trial_messages_used?: number
          beta_waiver_until?: string | null
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
          subscription_status?: 'free_trial' | 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
          subscription_tier?: 'free' | 'starter' | 'pro'
          ai_credits_remaining?: number
          copilot_trial_messages_used?: number
          beta_waiver_until?: string | null
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
      location_candidates: {
        Row: {
          id: string
          plan_id: string
          position: number
          name: string
          address: string | null
          neighborhood: string | null
          sq_ft: number | null
          asking_rent_cents: number | null
          cam_cents: number | null
          listing_url: string | null
          broker_contact: string | null
          status: 'shortlisted' | 'viewing_scheduled' | 'lease_review' | 'passed' | 'signed'
          notes: string | null
          archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          position?: number
          name: string
          address?: string | null
          neighborhood?: string | null
          sq_ft?: number | null
          asking_rent_cents?: number | null
          cam_cents?: number | null
          listing_url?: string | null
          broker_contact?: string | null
          status?: 'shortlisted' | 'viewing_scheduled' | 'lease_review' | 'passed' | 'signed'
          notes?: string | null
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          position?: number
          name?: string
          address?: string | null
          neighborhood?: string | null
          sq_ft?: number | null
          asking_rent_cents?: number | null
          cam_cents?: number | null
          listing_url?: string | null
          broker_contact?: string | null
          status?: 'shortlisted' | 'viewing_scheduled' | 'lease_review' | 'passed' | 'signed'
          notes?: string | null
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      location_rubric_scores: {
        Row: {
          id: string
          candidate_id: string
          factor_key: 'foot_traffic' | 'parking_transit' | 'visibility' | 'neighborhood_fit' | 'buildout_cost_estimate' | 'lease_terms'
          score_1_5: number | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          factor_key: 'foot_traffic' | 'parking_transit' | 'visibility' | 'neighborhood_fit' | 'buildout_cost_estimate' | 'lease_terms'
          score_1_5?: number | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          factor_key?: 'foot_traffic' | 'parking_transit' | 'visibility' | 'neighborhood_fit' | 'buildout_cost_estimate' | 'lease_terms'
          score_1_5?: number | null
          notes?: string | null
          updated_at?: string
        }
      }
      location_lease_terms: {
        Row: {
          id: string
          candidate_id: string
          base_rent_cents: number | null
          rent_escalation_pct: number | null
          security_deposit_cents: number | null
          ti_allowance_cents: number | null
          term_months: number | null
          options_text: string | null
          personal_guarantee: string | null
          exit_clauses: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          base_rent_cents?: number | null
          rent_escalation_pct?: number | null
          security_deposit_cents?: number | null
          ti_allowance_cents?: number | null
          term_months?: number | null
          options_text?: string | null
          personal_guarantee?: string | null
          exit_clauses?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          base_rent_cents?: number | null
          rent_escalation_pct?: number | null
          security_deposit_cents?: number | null
          ti_allowance_cents?: number | null
          term_months?: number | null
          options_text?: string | null
          personal_guarantee?: string | null
          exit_clauses?: string | null
          updated_at?: string
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
          tier: 'starter' | 'pro'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused'
          current_period_start: string | null
          current_period_end: string | null
          paused_from_tier: string | null
          paused_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: 'starter' | 'pro'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused'
          current_period_start?: string | null
          current_period_end?: string | null
          paused_from_tier?: string | null
          paused_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: 'starter' | 'pro'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused'
          current_period_start?: string | null
          current_period_end?: string | null
          paused_from_tier?: string | null
          paused_at?: string | null
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
      launch_milestones: {
        Row: {
          id: string
          plan_id: string
          title: string
          description: string | null
          track: 'legal_compliance' | 'real_estate_buildout' | 'equipment' | 'brand_marketing' | 'menu_operations' | 'people_hiring' | 'finance_admin' | 'pre_launch_events' | 'post_launch'
          target_date: string | null
          actual_date: string | null
          status: 'not_started' | 'in_progress' | 'blocked' | 'done'
          estimated_duration_days: number | null
          depends_on_milestone_ids: string[]
          critical_path: boolean
          owner: string
          ai_notes: string | null
          user_edited: boolean
          source: 'ai_generated' | 'user_added'
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          title: string
          description?: string | null
          track: 'legal_compliance' | 'real_estate_buildout' | 'equipment' | 'brand_marketing' | 'menu_operations' | 'people_hiring' | 'finance_admin' | 'pre_launch_events' | 'post_launch'
          target_date?: string | null
          actual_date?: string | null
          status?: 'not_started' | 'in_progress' | 'blocked' | 'done'
          estimated_duration_days?: number | null
          depends_on_milestone_ids?: string[]
          critical_path?: boolean
          owner?: string
          ai_notes?: string | null
          user_edited?: boolean
          source?: 'ai_generated' | 'user_added'
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          title?: string
          description?: string | null
          track?: 'legal_compliance' | 'real_estate_buildout' | 'equipment' | 'brand_marketing' | 'menu_operations' | 'people_hiring' | 'finance_admin' | 'pre_launch_events' | 'post_launch'
          target_date?: string | null
          actual_date?: string | null
          status?: 'not_started' | 'in_progress' | 'blocked' | 'done'
          estimated_duration_days?: number | null
          depends_on_milestone_ids?: string[]
          critical_path?: boolean
          owner?: string
          ai_notes?: string | null
          user_edited?: boolean
          source?: 'ai_generated' | 'user_added'
          order_index?: number
          created_at?: string
          updated_at?: string
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
