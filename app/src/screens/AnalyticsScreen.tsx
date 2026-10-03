import React, { useEffect, useState, useMemo } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { formatNgn } from '../utils/format';

type ViewMode = 'day' | 'month' | 'year';

interface BreakdownData {
  period: {
    view: ViewMode;
    current: string;
    label: string;
    previous: string;
    next: string;
  };
  summary: {
    total_inflow: number;
    total_outflow: number;
    net_delta: number;
    savings_invest_allocated: number;
    savings_invest_gross_rate?: number;
    savings_invest_net?: number;
    savings_invest_transfers?: number;
    savings_invest_transfers_out?: number;
    savings_invest_transfers_in?: number;
    savings_invest_rate: number;
    savings?: {
      allocated: number;
      transfer_in: number;
      transfer_out: number;
      debits: number;
      net_retained: number;
      rate: number;
    };
    invest?: {
      allocated: number;
      transfer_in: number;
      transfer_out: number;
      debits: number;
      net_retained: number;
      rate: number;
    };
    transaction_count: number;
    transfer_count?: number;
  };
  time_series: Array<{
    key: string;
    label: string;
    inflow: number;
    outflow: number;
    net: number;
  }>;
  expenses_by_category: Array<{
    category_id: number | null;
    category_name: string;
    bucket_id: number | null;
    bucket_name: string | null;
    bucket_key: string | null;
    total_amount: number;
    percentage: number;
    transaction_count: number;
    transactions: Array<{
      id: number;
      date: string;
      amount: number;
      note: string | null;
      account_name: string | null;
    }>;
  }>;
  inflows_by_source: Array<{
    source_id: number | null;
    source_name: string;
    total_amount: number;
    percentage: number;
    transaction_count: number;
    transactions: Array<{
      id: number;
      date: string;
      amount: number;
      note: string | null;
      account_name: string | null;
    }>;
  }>;
  bucket_transfers?: Array<{
    id: number;
    date: string;
    amount: number;
    reason: string | null;
    from_bucket_id: number;
    from_bucket_name: string;
    from_bucket_key: string;
    to_bucket_id: number;
    to_bucket_name: string;
    to_bucket_key: string;
  }>;
  all_transactions: Array<{
    id: number | string;
    date: string;
    direction: 'inflow' | 'outflow' | 'transfer';
    subtype: string | null;
    amount: number;
    currency: string;
    category_name: string | null;
    income_source_name: string | null;
    account_name: string | null;
    note: string | null;
    purpose_label?: string | null;
    from_bucket_name?: string;
    to_bucket_name?: string;
    from_bucket_key?: string;
    to_bucket_key?: string;
  }>;
}

export const AnalyticsScreen: React.FC = () => {
  const [view, setView] = useState<ViewMode>('month');
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const currentYearStr = useMemo(() => todayStr.slice(0, 4), [todayStr]);

  const [targetDate, setTargetDate] = useState<string>(todayStr);
  const [targetMonth, setTargetMonth] = useState<string>(currentMonthStr);
  const [targetYear, setTargetYear] = useState<string>(currentYearStr);

  const [availablePeriods, setAvailablePeriods] = useState<{ years: string[]; months: string[] }>({
    years: [],
    months: [],
  });

  const [data, setData] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inflow' | 'outflow' | 'transfer' | 'savings' | 'invest'>('all');
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);

  // Load available historical periods (distinct years/months with transactions)
  useEffect(() => {
    const fetchPeriods = async () => {
      try {
        const res = await fetch('/api/analytics/periods', {
          headers: { 'x-dev-bypass': 'true' },
        });
        if (res.ok) {
          const json = await res.json();
          setAvailablePeriods(json);
          // If current month has no transactions but historical months exist, prefer newest active month
          if (json.months?.length > 0 && !json.months.includes(currentMonthStr)) {
            setTargetMonth(json.months[0]);
            setTargetYear(json.months[0].slice(0, 4));
          }
        }
      } catch (err) {
        console.error('Failed to load periods:', err);
      }
    };
    fetchPeriods();
  }, [currentMonthStr]);

  // Fetch breakdown data on view or target period change
  useEffect(() => {
    fetchBreakdown();
  }, [view, targetDate, targetMonth, targetYear]);

  const fetchBreakdown = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (view === 'day') params.set('date', targetDate);
      if (view === 'month') params.set('month', targetMonth);
      if (view === 'year') params.set('year', targetYear);

      const res = await fetch(`/api/analytics/breakdown?${params.toString()}`, {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load analytics breakdown:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevPeriod = () => {
    if (!data) return;
    if (view === 'day') setTargetDate(data.period.previous);
    if (view === 'month') setTargetMonth(data.period.previous);
    if (view === 'year') setTargetYear(data.period.previous);
  };

  const handleNextPeriod = () => {
    if (!data) return;
    if (view === 'day') setTargetDate(data.period.next);
    if (view === 'month') setTargetMonth(data.period.next);
    if (view === 'year') setTargetYear(data.period.next);
  };

  const handleResetToCurrent = () => {
    if (view === 'day') setTargetDate(todayStr);
    if (view === 'month') setTargetMonth(currentMonthStr);
    if (view === 'year') setTargetYear(currentYearStr);
  };

  const toggleCategoryExpand = (catKey: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  const toggleSourceExpand = (srcKey: string) => {
    setExpandedSources((prev) => ({ ...prev, [srcKey]: !prev[srcKey] }));
  };

  // Filter transactions feed in period
  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    return data.all_transactions.filter((tx) => {
      if (directionFilter === 'inflow' && tx.direction !== 'inflow') return false;
      if (directionFilter === 'outflow' && tx.direction !== 'outflow') return false;
      if (directionFilter === 'transfer' && tx.direction !== 'transfer') return false;
      if (directionFilter === 'savings') {
        const isSavings = tx.from_bucket_key === 'savings' || 
          tx.to_bucket_key === 'savings' || 
          (tx.category_name && tx.category_name.toLowerCase().includes('savings'));
        if (!isSavings) return false;
      }
      if (directionFilter === 'invest') {
        const isInvest = tx.from_bucket_key === 'invest' || 
          tx.to_bucket_key === 'invest' || 
          (tx.category_name && tx.category_name.toLowerCase().includes('invest'));
        if (!isInvest) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const noteMatch = tx.note?.toLowerCase().includes(query);
        const catMatch = tx.category_name?.toLowerCase().includes(query);
        const srcMatch = tx.income_source_name?.toLowerCase().includes(query);
        const accMatch = tx.account_name?.toLowerCase().includes(query);
        const amtMatch = String(tx.amount).includes(query);
        return noteMatch || catMatch || srcMatch || accMatch || amtMatch;
      }
      return true;
    });
  }, [data, directionFilter, searchQuery]);

  // Chart configuration for Inflow vs Outflow
  const chartConfig = useMemo(() => {
    if (!data || data.time_series.length === 0) {
      return {
        type: 'bar' as const,
        data: { labels: [], datasets: [] },
      };
    }

    return {
      type: 'bar' as const,
      data: {
        labels: data.time_series.map((d) => d.label),
        datasets: [
          {
            label: 'Inflows',
            data: data.time_series.map((d) => d.inflow),
            backgroundColor: '#16A34A',
            borderRadius: 4,
            barPercentage: 0.6,
          },
          {
            label: 'Expenses',
            data: data.time_series.map((d) => d.outflow),
            backgroundColor: '#DC2626',
            borderRadius: 4,
            barPercentage: 0.6,
          },
        ],
      },
      options: {
        interaction: {
          mode: 'index' as const,
          intersect: false,
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: view === 'month' ? 16 : 12,
              color: '#64748B',
              font: { size: 11 },
            },
          },
          y: {
            border: { display: false },
            grid: { color: 'rgba(226, 232, 240, 0.6)' },
            ticks: {
              callback: (value: any) => '₦' + Number(value).toLocaleString('en-NG'),
              color: '#64748B',
              font: { size: 11 },
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ₦${Number(ctx.raw).toLocaleString('en-NG')}`,
            },
          },
        },
      },
    };
  }, [data, view]);

  return (
    <div className="analytics-screen" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0 }}>
            Cash Flow & Category Analytics
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary, #64748B)', margin: '4px 0 0 0' }}>
            Multi-period financial intelligence, income streams, and deep category spending breakdown
          </p>
        </div>

        {/* View Mode Toggle Pills */}
        <div style={{ display: 'inline-flex', padding: '4px', backgroundColor: 'var(--bg-card, #FFFFFF)', borderRadius: '10px', border: '1px solid var(--border-color, #E2E8F0)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <button
            onClick={() => setView('day')}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: view === 'day' ? 'var(--color-primary, #2563EB)' : 'transparent',
              color: view === 'day' ? '#FFFFFF' : 'var(--color-text-secondary, #64748B)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Day View
          </button>
          <button
            onClick={() => setView('month')}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: view === 'month' ? 'var(--color-primary, #2563EB)' : 'transparent',
              color: view === 'month' ? '#FFFFFF' : 'var(--color-text-secondary, #64748B)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Month View
          </button>
          <button
            onClick={() => setView('year')}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: view === 'year' ? 'var(--color-primary, #2563EB)' : 'transparent',
              color: view === 'year' ? '#FFFFFF' : 'var(--color-text-secondary, #64748B)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Year View
          </button>
        </div>
      </div>

      {/* 2. Interactive Period Selector Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        backgroundColor: 'var(--bg-card, #FFFFFF)',
        borderRadius: 'var(--radius-md, 12px)',
        border: '1px solid var(--border-color, #E2E8F0)',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {/* Navigation Arrows + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handlePrevPeriod}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #CBD5E1)',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
              color: 'var(--color-text-primary, #0F172A)',
            }}
            title="Previous Period"
          >
            ‹
          </button>

          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', minWidth: '180px' }}>
            {data?.period.label || 'Loading...'}
          </span>

          <button
            onClick={handleNextPeriod}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #CBD5E1)',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
              color: 'var(--color-text-primary, #0F172A)',
            }}
            title="Next Period"
          >
            ›
          </button>

          <button
            onClick={handleResetToCurrent}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid var(--border-color, #E2E8F0)',
              backgroundColor: 'var(--bg-secondary, #F8FAFC)',
              color: 'var(--color-text-secondary, #475569)',
              cursor: 'pointer',
            }}
          >
            {view === 'day' ? 'Today' : view === 'year' ? 'Current Year' : 'Current Month'}
          </button>
        </div>

        {/* Quick Period Picker Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {view === 'day' && (
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #CBD5E1)',
                backgroundColor: '#FFFFFF',
                color: 'var(--color-text-primary, #0F172A)',
              }}
            />
          )}

          {view === 'month' && (
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #CBD5E1)',
                backgroundColor: '#FFFFFF',
                color: 'var(--color-text-primary, #0F172A)',
                cursor: 'pointer',
              }}
            >
              {availablePeriods.months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {view === 'year' && (
            <select
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #CBD5E1)',
                backgroundColor: '#FFFFFF',
                color: 'var(--color-text-primary, #0F172A)',
                cursor: 'pointer',
              }}
            >
              {availablePeriods.years.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 3. Executive Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <KpiCard
          label="Total Inflows"
          value={formatNgn(data?.summary.total_inflow || 0)}
          subtext="Gross receipts in period"
          icon="↓"
          tone="positive"
        />

        <KpiCard
          label="Total Expenses"
          value={formatNgn(data?.summary.total_outflow || 0)}
          subtext="Categorized outflows in period"
          icon="↑"
          tone="negative"
        />

        <KpiCard
          label="Net Operating Delta"
          value={(data?.summary.net_delta || 0) >= 0 ? `+${formatNgn(data?.summary.net_delta || 0)}` : `-${formatNgn(Math.abs(data?.summary.net_delta || 0))}`}
          subtext={(data?.summary.net_delta || 0) >= 0 ? 'Surplus cash retained' : 'Deficit / Net draw'}
          icon="⚖️"
          tone={(data?.summary.net_delta || 0) >= 0 ? 'positive' : 'negative'}
        />

        <KpiCard
          label="Savings (Retained)"
          value={formatNgn(data?.summary.savings?.net_retained ?? (data?.summary.savings_invest_net ? data.summary.savings_invest_net / 2 : 0))}
          subtext={
            (data?.summary.savings?.transfer_in || 0) > 0 || (data?.summary.savings?.transfer_out || 0) > 0
              ? `${data?.summary.savings?.rate || 0}% retained (${formatNgn(data?.summary.savings?.allocated || 0)} gross${(data?.summary.savings?.transfer_in || 0) > 0 ? ` +${formatNgn(data?.summary.savings?.transfer_in || 0)} in` : ''}${(data?.summary.savings?.transfer_out || 0) > 0 ? ` -${formatNgn(data?.summary.savings?.transfer_out || 0)} out` : ''})`
              : `${data?.summary.savings?.rate || 0}% waterfall allocation (${formatNgn(data?.summary.savings?.allocated || 0)})`
          }
          icon="🏦"
          tone={
            (data?.summary.savings?.transfer_out || 0) > 0 && (data?.summary.savings?.net_retained || 0) === 0
              ? 'negative'
              : (data?.summary.savings?.net_retained || 0) > 0
              ? 'positive'
              : 'neutral'
          }
        />

        <KpiCard
          label="Investment (Retained)"
          value={formatNgn(data?.summary.invest?.net_retained ?? (data?.summary.savings_invest_net ? data.summary.savings_invest_net / 2 : 0))}
          subtext={
            (data?.summary.invest?.transfer_in || 0) > 0 || (data?.summary.invest?.transfer_out || 0) > 0
              ? `${data?.summary.invest?.rate || 0}% retained (${formatNgn(data?.summary.invest?.allocated || 0)} gross${(data?.summary.invest?.transfer_in || 0) > 0 ? ` +${formatNgn(data?.summary.invest?.transfer_in || 0)} in` : ''}${(data?.summary.invest?.transfer_out || 0) > 0 ? ` -${formatNgn(data?.summary.invest?.transfer_out || 0)} out` : ''})`
              : `${data?.summary.invest?.rate || 0}% waterfall allocation (${formatNgn(data?.summary.invest?.allocated || 0)})`
          }
          icon="📈"
          tone={
            (data?.summary.invest?.transfer_out || 0) > 0 && (data?.summary.invest?.net_retained || 0) === 0
              ? 'negative'
              : (data?.summary.invest?.net_retained || 0) > 0
              ? 'positive'
              : 'neutral'
          }
        />
      </div>

      {/* 4. Cash Flow Chart: Inflows vs Outflows */}
      {view !== 'day' && (
        <ChartCard
          title={view === 'year' ? `Monthly Cash Flow Breakdown (${data?.period.label})` : `Daily Cash Flow Breakdown (${data?.period.label})`}
          subtitle={view === 'year' ? 'Comparison of income vs expenses across all 12 months' : 'Day-by-day cash flow activity. Identifies peaks and spending spikes'}
          config={chartConfig as any}
          height={300}
        />
      )}

      {/* 5. Two-Column Detailed Breakdown: Categorized Expenses & Inflows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* Left: Categorized Expenses */}
        <div style={{
          backgroundColor: 'var(--bg-card, #FFFFFF)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border-color, #E2E8F0)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0 }}>
              Expense Breakdown by Category
            </h2>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-negative, #DC2626)' }}>
              {formatNgn(data?.summary.total_outflow || 0)}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>Loading categorized expenses...</div>
          ) : !data || data.expenses_by_category.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No expenses recorded in this period.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.expenses_by_category.map((cat, idx) => {
                const catKey = String(cat.category_id || `uncat_${idx}`);
                const isExpanded = Boolean(expandedCategories[catKey]);

                return (
                  <div
                    key={catKey}
                    style={{
                      border: '1px solid var(--border-color, #E2E8F0)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: isExpanded ? 'var(--bg-secondary, #F8FAFC)' : '#FFFFFF',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => toggleCategoryExpand(catKey)}
                      style={{
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#94A3B8', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                          ▶
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                            {cat.category_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {cat.transaction_count} {cat.transaction_count === 1 ? 'transaction' : 'transactions'}
                            {cat.bucket_name && ` • ${cat.bucket_name}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                          {formatNgn(cat.total_amount)}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-negative, #DC2626)' }}>
                          {cat.percentage}% of spend
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: '4px', backgroundColor: '#F1F5F9', width: '100%' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(cat.percentage, 100)}%`,
                          backgroundColor: '#EF4444',
                        }}
                      />
                    </div>

                    {/* Expanded Transactions List */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 14px', backgroundColor: '#FFFFFF' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#94A3B8', marginBottom: '8px' }}>
                          Underlying Transactions ({cat.transactions.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {cat.transactions.map((tx) => (
                            <div
                              key={tx.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTxId(tx.id);
                              }}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#F8FAFC',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600, color: '#334155', marginRight: '8px' }}>{tx.date}</span>
                                <span style={{ color: '#64748B' }}>{tx.note || 'No note'}</span>
                                {tx.account_name && <span style={{ color: '#94A3B8', marginLeft: '6px' }}>({tx.account_name})</span>}
                              </div>
                              <span style={{ fontWeight: 700, color: '#DC2626' }}>
                                -{formatNgn(tx.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Income Streams Breakdown */}
        <div style={{
          backgroundColor: 'var(--bg-card, #FFFFFF)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border-color, #E2E8F0)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0 }}>
              Inflow Breakdown by Income Source
            </h2>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-positive, #16A34A)' }}>
              {formatNgn(data?.summary.total_inflow || 0)}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>Loading income streams...</div>
          ) : !data || data.inflows_by_source.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No inflows recorded in this period.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.inflows_by_source.map((src, idx) => {
                const srcKey = String(src.source_id || `src_${idx}`);
                const isExpanded = Boolean(expandedSources[srcKey]);

                return (
                  <div
                    key={srcKey}
                    style={{
                      border: '1px solid var(--border-color, #E2E8F0)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: isExpanded ? 'var(--bg-secondary, #F8FAFC)' : '#FFFFFF',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => toggleSourceExpand(srcKey)}
                      style={{
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#94A3B8', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                          ▶
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                            {src.source_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {src.transaction_count} {src.transaction_count === 1 ? 'receipt' : 'receipts'}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                          {formatNgn(src.total_amount)}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-positive, #16A34A)' }}>
                          {src.percentage}% of income
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: '4px', backgroundColor: '#F1F5F9', width: '100%' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(src.percentage, 100)}%`,
                          backgroundColor: '#16A34A',
                        }}
                      />
                    </div>

                    {/* Expanded Transactions List */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 14px', backgroundColor: '#FFFFFF' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#94A3B8', marginBottom: '8px' }}>
                          Underlying Receipts ({src.transactions.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {src.transactions.map((tx) => (
                            <div
                              key={tx.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTxId(tx.id);
                              }}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#F8FAFC',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600, color: '#334155', marginRight: '8px' }}>{tx.date}</span>
                                <span style={{ color: '#64748B' }}>{tx.note || 'Inflow receipt'}</span>
                                {tx.account_name && <span style={{ color: '#94A3B8', marginLeft: '6px' }}>({tx.account_name})</span>}
                              </div>
                              <span style={{ fontWeight: 700, color: '#16A34A' }}>
                                +{formatNgn(tx.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 6. Inter-Bucket Fund Transfers Section */}
      {data?.bucket_transfers && data.bucket_transfers.length > 0 && (
        <div style={{
          backgroundColor: 'var(--bg-card, #FFFFFF)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border-color, #E2E8F0)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⇄</span> Inter-Bucket Fund Transfers ({data.bucket_transfers.length})
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                Internal capital reallocations executed in {data?.period.label} to address bucket deficits
              </p>
            </div>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              padding: '4px 10px',
              borderRadius: '6px',
            }}>
              Net Reallocated: {formatNgn(Math.abs(data.summary.savings_invest_transfers || 0))}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {data.bucket_transfers.map((bt) => (
              <div
                key={bt.id}
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  backgroundColor: '#F8FAFC',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#E2E8F0', fontSize: '11px' }}>
                      {bt.from_bucket_name}
                    </span>
                    <span>→</span>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DBEAFE', color: '#1E40AF', fontSize: '11px' }}>
                      {bt.to_bucket_name}
                    </span>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#2563EB' }}>
                    ⇄ {formatNgn(bt.amount)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748B' }}>
                  <span>{bt.date}</span>
                  <span style={{ fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bt.reason || 'Inter-bucket rebalance'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Period Transaction Ledger & Search */}
      <div style={{
        backgroundColor: 'var(--bg-card, #FFFFFF)',
        borderRadius: 'var(--radius-md, 12px)',
        border: '1px solid var(--border-color, #E2E8F0)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0 }}>
              Period Transaction Ledger ({filteredTransactions.length})
            </h2>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
              Full chronological audit log for {data?.period.label}
            </p>
          </div>

          {/* Search + Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search by note, category, or account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #CBD5E1)',
                minWidth: '220px',
              }}
            />

            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as any)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #CBD5E1)',
                backgroundColor: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Movements</option>
              <option value="inflow">Inflows Only</option>
              <option value="outflow">Expenses Only</option>
              <option value="transfer">⇄ Bucket Transfers Only</option>
              <option value="savings">🏦 Savings Activity</option>
              <option value="invest">📈 Investment Activity</option>
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color, #E2E8F0)', textAlign: 'left', color: '#64748B', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 12px' }}>Date</th>
                <th style={{ padding: '8px 12px' }}>Type</th>
                <th style={{ padding: '8px 12px' }}>Category / Source</th>
                <th style={{ padding: '8px 12px' }}>Account</th>
                <th style={{ padding: '8px 12px' }}>Description / Note</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                    No transactions match your search or period filter.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => typeof tx.id === 'number' && setSelectedTxId(tx.id)}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      cursor: typeof tx.id === 'number' ? 'pointer' : 'default',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                      {tx.date}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {tx.direction === 'inflow' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: '#DCFCE7',
                            color: '#16A34A',
                          }}
                        >
                          ↓ Inflow
                        </span>
                      ) : tx.direction === 'transfer' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: '#DBEAFE',
                            color: '#1D4ED8',
                          }}
                        >
                          ⇄ Transfer
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: '#FEE2E2',
                            color: '#DC2626',
                          }}
                        >
                          ↑ Expense
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>
                      {tx.direction === 'inflow'
                        ? tx.income_source_name || tx.category_name || 'Income'
                        : tx.direction === 'transfer'
                        ? <span style={{ color: '#1D4ED8' }}>{tx.category_name}</span>
                        : tx.category_name || 'Expense'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>
                      {tx.account_name || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#475569', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.note || tx.purpose_label || '—'}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: tx.direction === 'inflow' ? '#16A34A' : tx.direction === 'transfer' ? '#2563EB' : '#DC2626',
                      whiteSpace: 'nowrap',
                    }}>
                      {tx.direction === 'inflow'
                        ? `+${formatNgn(tx.amount)}`
                        : tx.direction === 'transfer'
                        ? `⇄ ${formatNgn(tx.amount)}`
                        : `-${formatNgn(tx.amount)}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTxId && (
        <TransactionDetailModal
          isOpen={Boolean(selectedTxId)}
          transactionId={selectedTxId}
          onClose={() => setSelectedTxId(null)}
          onSuccess={() => {
            setSelectedTxId(null);
            fetchBreakdown();
          }}
        />
      )}
    </div>
  );
};
