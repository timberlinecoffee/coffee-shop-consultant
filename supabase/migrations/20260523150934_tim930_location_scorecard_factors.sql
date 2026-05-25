-- TIM-930: Expand location_rubric_scores.factor_key to include scorecard criteria.
-- The original 6 rubric factors remain; 13 scorecard-specific factors are added.

ALTER TABLE public.location_rubric_scores
  DROP CONSTRAINT location_rubric_scores_factor_key_check;

ALTER TABLE public.location_rubric_scores
  ADD CONSTRAINT location_rubric_scores_factor_key_check
  CHECK (factor_key IN (
    -- Original rubric factors (keep for RubricGridCard)
    'foot_traffic',
    'parking_transit',
    'visibility',
    'neighborhood_fit',
    'buildout_cost_estimate',
    'lease_terms',
    -- Scorecard factors (TIM-930)
    'foot_traffic_weekday',
    'foot_traffic_weekend',
    'street_visibility',
    'parking',
    'public_transit',
    'surrounding_businesses',
    'demographics_fit',
    'lease_cost_vs_market',
    'space_layout',
    'buildout_condition',
    'permits_zoning',
    'safety_perception',
    'gut_feel'
  ));
