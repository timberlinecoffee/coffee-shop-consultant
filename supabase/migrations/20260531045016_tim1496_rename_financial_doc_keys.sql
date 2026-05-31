-- TIM-1496: rename old financial document keys to match new registry
-- Old: profit_and_loss, cash_flow, balance_sheet
-- New: monthly_pl, monthly_cash_flow, monthly_balance_sheet

UPDATE business_plan_financial_documents
  SET document_key = 'monthly_pl'
  WHERE document_key = 'profit_and_loss';

UPDATE business_plan_financial_documents
  SET document_key = 'monthly_cash_flow'
  WHERE document_key = 'cash_flow';

UPDATE business_plan_financial_documents
  SET document_key = 'monthly_balance_sheet'
  WHERE document_key = 'balance_sheet';
