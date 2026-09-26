export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  DEV_AUTH_BYPASS?: string;
  SESSION_SECRET?: string;
}

export interface AppVariables {
  user?: any;
}

export interface AllocationBucket {
  id: number;
  key: 'tithe' | 'kingdom' | 'savings' | 'invest' | 'charity' | 'expense';
  name: string;
  is_pass_through: number;
  created_at: string;
}

export interface AllocationRule {
  id: number;
  version: number;
  tithe_pct: number;
  kingdom_pct: number;
  savings_pct: number;
  invest_pct: number;
  charity_pct: number;
  expense_pct: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  default_bucket_id: number | null;
  bucket_is_flexible: number;
  type: 'expense' | 'income';
  created_at: string;
}

export interface IncomeSource {
  id: number;
  name: string;
  created_at: string;
}

export interface Account {
  id: number;
  name: string;
  type: string;
  currency: string;
  institution: string | null;
  last_reconciled_balance: number | null;
  last_reconciled_date: string | null;
  created_at: string;
}

export interface Transaction {
  id: number;
  external_id: string | null;
  date: string;
  direction: 'inflow' | 'outflow';
  subtype: 'bucket_deploy' | 'bucket_transfer' | null;
  amount: number;
  currency: string;
  category_id: number | null;
  account_id: number | null;
  income_source_id: number | null;
  note: string | null;
  purpose_label: string | null;
  allocation_rule_version: number | null;
  is_override: number;
  attachment_url: string | null;
  created_at: string;
}

export interface AllocationRun {
  id: number;
  transaction_id: number;
  bucket_id: number;
  amount: number;
  created_at: string;
}

export type LedgerEntryType =
  | 'allocation_credit'
  | 'expense_debit'
  | 'transfer_in'
  | 'transfer_out'
  | 'manual_adjustment';

export interface BucketLedgerEntry {
  id: number;
  bucket_id: number;
  transaction_id: number | null;
  entry_type: LedgerEntryType;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

export interface BucketTransfer {
  id: number;
  from_bucket_id: number;
  to_bucket_id: number;
  amount: number;
  date: string;
  reason: string | null;
  from_ledger_entry_id: number | null;
  to_ledger_entry_id: number | null;
  created_at: string;
}

export interface TransactionAuditLog {
  id: number;
  transaction_id: number;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface OverrideSplit {
  tithe_pct: number;
  kingdom_pct: number;
  savings_pct: number;
  invest_pct: number;
  charity_pct: number;
  expense_pct: number;
}

export interface BucketWithBalance {
  id: number;
  key: string;
  name: string;
  is_pass_through: number;
  balance: number;
}

export interface MonthlySummary {
  id: number;
  month: string;
  category_id: number | null;
  bucket_id: number | null;
  total_amount: number;
  refreshed_at: string;
}

export interface NetWorthSnapshot {
  id: number;
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  base_currency: string;
  created_at: string;
}

export interface FxRate {
  id: number;
  date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  created_at: string;
}

export interface HealthDashboardData {
  net_worth_current: number;
  net_worth_trend: Array<{ date: string; net_worth: number; total_assets: number; total_liabilities: number }>;
  savings_invest_rate: {
    this_month_pct: number;
    last_month_pct: number;
    change_pct: number;
  };
  allocation_waterfall: {
    month: string;
    gross_inflow: number;
    splits: Record<string, number>;
  };
  budget_adherence_summary: {
    overall_adherence_pct: number;
    categories: Array<{
      category_id: number;
      category_name: string;
      planned: number;
      actual: number;
      variance_pct: number;
    }>;
    worst_offenders: Array<{
      category_id: number;
      category_name: string;
      planned: number;
      actual: number;
      overage_amount: number;
      variance_pct: number;
    }>;
  };
  runway: {
    expenses_balance: number;
    avg_daily_burn: number;
    runway_days: number;
  };
}

export interface LedgerDashboardData {
  buckets: BucketWithBalance[];
  daily_series: Array<{
    date: string;
    inflow: number;
    outflow: number;
  }>;
  recent_transactions: Array<Transaction & { category_name?: string; bucket_name?: string; account_name?: string }>;
}

export interface Budget {
  id: number;
  month: string;
  category_id: number;
  planned_amount: number;
  created_at: string;
}

export interface BudgetVarianceItem {
  category_id: number;
  category_name: string;
  bucket_id?: number | null;
  bucket_key?: string | null;
  planned: number;
  actual: number;
  variance_pct: number;
  overage_amount: number;
  status: 'under' | 'warning' | 'over';
}

export interface WorstOffender {
  category_id: number;
  category_name: string;
  planned: number;
  actual: number;
  overage_amount: number;
  variance_pct: number;
}

export interface OverallAdherenceResult {
  month: string;
  overall_adherence_pct: number;
  total_planned: number;
  total_actual: number;
  categories: BudgetVarianceItem[];
  worst_offenders: WorstOffender[];
}

export interface BudgetTrendItem {
  month: string;
  overall_adherence_pct: number;
  total_planned: number;
  total_actual: number;
}

