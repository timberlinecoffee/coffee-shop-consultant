-- TIM-2447: Seed benchmark_metrics catalog.
--
-- One row per metric we benchmark. Pillars 1-4 are Phase 0 ship target.
-- Pillars 5-8 are seeded so the catalog is complete even before extraction
-- runs land data for them (avoids a metric-key mismatch when later phases
-- run their first extraction). Idempotent.

INSERT INTO public.benchmark_metrics (metric_key, pillar, name, unit, direction_of_better, description) VALUES
  -- Pillar 1: Revenue & traffic
  ('auv_usd',                       'revenue_traffic',     'Average unit volume (annual revenue per location)', 'usd_year',     'higher', 'Annual revenue per shop. The single highest-signal revenue metric.'),
  ('avg_ticket_usd',                'revenue_traffic',     'Average ticket size',                                'usd',          'higher', 'Average $ per transaction.'),
  ('transactions_per_day',          'revenue_traffic',     'Transactions per day',                               'count_day',    'higher', 'Daily transaction count (covers).'),
  ('revenue_per_sqft_usd',          'revenue_traffic',     'Revenue per square foot (annual)',                  'usd_sqft_year','higher', 'Annual revenue divided by built area.'),
  ('transactions_per_hour',         'revenue_traffic',     'Transactions per hour',                              'count_hour',   'higher', 'Throughput at peak / average hour.'),

  -- Pillar 2: COGS
  ('total_cogs_pct',                'cogs',                'Total cost of goods sold (% of revenue)',            'pct',          'lower',  'All COGS including beverage and food.'),
  ('beverage_cogs_pct',             'cogs',                'Beverage COGS (% of beverage revenue)',              'pct',          'lower',  'Coffee + milk + syrups + cups for beverage sales only.'),
  ('food_cogs_pct',                 'cogs',                'Food COGS (% of food revenue)',                      'pct',          'lower',  'Food and pastry ingredients only.'),
  ('waste_pct',                     'cogs',                'Waste (% of inputs)',                                'pct',          'lower',  'Spoilage / pulled-shot / dumped-milk percentage.'),

  -- Pillar 3: Labor
  ('labor_pct_of_revenue',          'labor',               'Labor cost (% of revenue)',                          'pct',          'lower',  'All wages + payroll taxes / total revenue.'),
  ('sales_per_labor_hour_usd',      'labor',               'Sales per labor hour',                               'usd_hour',     'higher', 'Revenue divided by total worked hours.'),
  ('turnover_pct_annual',           'labor',               'Staff turnover (% annual)',                          'pct',          'lower',  'Annualized rolling turnover.'),
  ('wage_rate_usd_hour',            'labor',               'Average wage rate',                                  'usd_hour',     'range',  'Average baseline wage rate (pre-tip).'),

  -- Pillar 4: Real estate & fitout
  ('rent_pct_of_revenue',           'real_estate_fitout',  'Rent (% of revenue)',                                'pct',          'lower',  'Base rent + CAM as % of revenue.'),
  ('rent_per_sqft_annual_usd',      'real_estate_fitout',  'Rent per square foot (annual)',                      'usd_sqft_year','range',  'Annual base rent per sqft.'),
  ('fitout_per_sqft_usd',           'real_estate_fitout',  'Fit-out cost per square foot',                       'usd_sqft',     'lower',  'Total fit-out capex divided by sqft.'),
  ('lease_term_years',              'real_estate_fitout',  'Lease term (years)',                                 'years',        'range',  'Initial term length.'),

  -- Pillar 5: Equipment & throughput (catalog only, Phase 0 doesn't extract these)
  ('equipment_capex_per_auv_pct',   'equipment_throughput', 'Equipment capex / AUV',                              'pct',          'lower',  'Total equipment spend as a % of expected first-year AUV.'),
  ('group_heads_per_peak_tx',       'equipment_throughput', 'Espresso group heads per peak hourly transactions',  'count',        'range',  'Throughput sizing of the espresso bar.'),

  -- Pillar 6: Menu & pricing (overlaps with TIM-1698 industry-benchmarks.ts)
  ('avg_drink_price_usd',           'menu_pricing',         'Average drink price',                                'usd',          'range',  'Mean price across drink menu.'),
  ('attach_rate_food_pct',          'menu_pricing',         'Food attach rate',                                    'pct',          'higher', 'Percentage of orders that include a food item.'),
  ('discount_pct',                  'menu_pricing',         'Discount / promo (% of revenue)',                    'pct',          'lower',  'Discounts as a share of gross revenue.'),

  -- Pillar 7: Marketing & loyalty
  ('cac_usd',                       'marketing_loyalty',    'Customer acquisition cost',                          'usd',          'lower',  'Total marketing spend / new customers acquired.'),
  ('repeat_visit_rate_pct',         'marketing_loyalty',    'Repeat visit rate (% within 30d)',                   'pct',          'higher', 'Share of customers who return within 30 days.'),
  ('loyalty_enrollment_pct',        'marketing_loyalty',    'Loyalty enrollment (% of customers)',                'pct',          'higher', 'Customers signed up for the loyalty program.'),
  ('google_rating_avg',             'marketing_loyalty',    'Google rating (average)',                            'rating_5',     'higher', 'Mean Google rating across reviews.'),

  -- Pillar 8: Customer experience
  ('wait_time_seconds',             'customer_experience',  'Wait time (seconds, order-to-handoff)',              'seconds',      'lower',  'Time from order placed to drink in hand.'),
  ('complaint_rate_pct',            'customer_experience',  'Complaint rate (% of transactions)',                 'pct',          'lower',  'Logged complaints / total transactions.')
ON CONFLICT (metric_key) DO UPDATE SET
  pillar = EXCLUDED.pillar,
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  direction_of_better = EXCLUDED.direction_of_better,
  description = EXCLUDED.description;
