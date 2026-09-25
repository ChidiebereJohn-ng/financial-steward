export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  DEV_AUTH_BYPASS?: string;
  SESSION_SECRET?: string;
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
