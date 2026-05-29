-- TIM-1304: Seed pre_boarding phase template rows
INSERT INTO onboarding_plan_templates (org_role_template_id, phase, task, detail, order_index, is_system)
VALUES
  (NULL, 'pre_boarding', 'Send Welcome Letter and First-Day Schedule', 'Email a warm welcome message including the start time, dress code, parking instructions, and who to ask for on arrival. Attach the first-day schedule.', 0, true),
  (NULL, 'pre_boarding', 'Collect Required New-Hire Documents', 'Request completed W-4, I-9 Section 1, direct deposit form, and any state-specific tax forms. Use your HR portal or email if no portal is set up.', 1, true),
  (NULL, 'pre_boarding', 'Set Up POS and System Logins', 'Create accounts in your POS system, scheduling app, and any other tools the new hire will use. Send credentials securely before Day 1.', 2, true),
  (NULL, 'pre_boarding', 'Order Uniform and Equipment', 'Confirm shirt size and order any branded items. Prepare the station, keys, and any tools they will need ready at their workstation on Day 1.', 3, true)
ON CONFLICT DO NOTHING;
