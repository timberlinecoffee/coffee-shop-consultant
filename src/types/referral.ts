// TIM-1179: Shared types for the equipment referrals admin table.

export interface EquipmentReferral {
  id: string;
  brand: string;
  model: string;
  category: string;
  station: string;
  referral_url: string;
  partner_name: string;
  notes: string;
  active_flag: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentRecommendation {
  item_id: string;
  recommended_brand: string;
  recommended_model: string;
  estimated_price_cents: number;
  referral_url: string | null;
  partner_name: string | null;
}
