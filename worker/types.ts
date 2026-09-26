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
  upcoming_commitments?: RecurringWithDue[];
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

// Module 5: Commitments & Reconciliation
export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  linked_bucket_id: number | null;
  created_at: string;
}

export interface GoalWithProgress extends Goal {
  linked_bucket_key?: string | null;
  linked_bucket_name?: string | null;
  current_amount: number;
  progress_pct: number;
  remaining_amount: number;
}

export interface Liability {
  id: number;
  name: string;
  type: string;
  principal: number;
  current_balance: number;
  interest_rate: number | null;
  minimum_payment: number | null;
  due_date: string | null;
  lender: string | null;
  currency: string;
  created_at: string;
}

export interface RecurringTransaction {
  id: number;
  category_id: number | null;
  bucket_id: number | null;
  account_id: number | null;
  direction: 'inflow' | 'outflow';
  amount: number;
  currency: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_due_date: string;
  active: number;
  note: string | null;
  created_at: string;
}

export interface RecurringWithDue extends RecurringTransaction {
  category_name?: string | null;
  bucket_name?: string | null;
  bucket_key?: string | null;
  account_name?: string | null;
  days_until_due: number;
  is_upcoming: boolean;
}

export interface ReconciliationResult {
  account_id: number;
  account_name: string;
  currency: string;
  actual_balance: number;
  computed_balance: number;
  variance: number;
  is_reconciled: boolean;
  reconciled_date: string;
}

// Module 6: Investor Module
export interface Investment {
  id: number;
  type: 'equity' | 'mutual_fund' | 'treasury_bill' | 'crypto' | string;
  symbol_or_name: string;
  market: 'NGX' | 'global' | 'crypto' | string;
  quantity: number | null;
  cost_basis: number;
  currency: string;
  current_value: number | null;
  strategy_id: number | null;
  account_id: number | null;
  created_at: string;
}

export interface InvestmentWithGainLoss extends Investment {
  unrealized_gain_loss: number;
  unrealized_gain_loss_pct: number;
  latest_price: number | null;
  latest_price_date: string | null;
  price_source: 'manual' | 'api' | null;
  strategy_name?: string | null;
  account_name?: string | null;
}

export interface InvestmentPriceUpdate {
  id: number;
  investment_id: number;
  date: string;
  price: number;
  source: 'manual' | 'api';
  created_at: string;
}

export interface Strategy {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface StrategyStage {
  id: number;
  strategy_id: number;
  stage_order: number;
  asset_type: string;
  duration_months: number;
  expected_return_pct: number;
  created_at?: string;
}

export interface StrategyWithStages extends Strategy {
  stages: StrategyStage[];
}

export interface CompoundingSimulationPoint {
  stage_order: number;
  asset_type: string;
  duration_months: number;
  cumulative_months: number;
  starting_capital: number;
  expected_return_pct: number;
  gain_amount: number;
  ending_capital: number;
}

export interface CompoundingSimulationResult {
  strategy_id?: number | null;
  strategy_name?: string | null;
  starting_capital: number;
  final_capital: number;
  total_gain: number;
  total_return_pct: number;
  total_duration_months: number;
  disclaimer: 'Projection, not a live position';
  timeline: CompoundingSimulationPoint[];
}

export interface PortfolioSummary {
  total_portfolio_value_ngn: number;
  total_cost_basis_ngn: number;
  total_gain_loss_ngn: number;
  total_gain_loss_pct: number;
  markets: {
    ngx: { count: number; total_value_ngn: number; total_gain_loss_ngn: number };
    global: { count: number; total_value_ngn: number; total_gain_loss_ngn: number };
    crypto: { count: number; total_value_ngn: number; total_gain_loss_ngn: number };
  };
}

