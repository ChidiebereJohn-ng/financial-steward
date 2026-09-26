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
