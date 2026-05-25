// TIM-1038: Shared types for buildout sections and supplies.

export interface ListSection {
  id: string;
  plan_id: string;
  list_type: "equipment" | "supplies";
  name: string;
  position: number;
  collapsed: boolean;
}

export interface SuppliesItem {
  id: string;
  plan_id: string;
  section_id: string | null;
  name: string;
  vendor: string | null;
  unit_type: string;
  quantity: number;
  unit_cost_cents: number;
  source: "ai_suggested" | "user_added";
  notes: string | null;
  position: number;
  archived: boolean;
}
