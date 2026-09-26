import React, { useEffect, useState } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import { BucketBadge } from '../components/BucketBadge';
import type { LedgerDashboardData } from '../../../worker/types';

export const LedgerDashboard: React.FC = () => {
  const [data, setData] = useState<LedgerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedgerData();
  }, []);

  const fetchLedgerData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/ledger', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load ledger dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', color: 'var(--color-text-secondary)' }}>
        Loading Money Movement Dashboard...
      </div>
    );
  }

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // Compute stat card summaries from daily series and buckets
  const totalInflows30 = data.daily_series.reduce((sum, d) => sum + d.inflow, 0);
  const totalOutflows30 = data.daily_series.reduce((sum, d) => sum + d.outflow, 0);
  const netDelta30 = totalInflows30 - totalOutflows30;
  const totalBucketFunds = data.buckets.reduce((sum, b) => sum + b.balance, 0);

  // 30-Day Inflow / Outflow daily bar chart (rounded top corners, generous gap, faint baseline)
  const dailySeries = data.daily_series;
  const inflowOutflowChartConfig = {
    type: 'bar' as const,
    data: {
      labels: dailySeries.map((d) => d.date.slice(5)), // MM-DD
      datasets: [
        {
          label: 'Inflows',
          data: dailySeries.map((d) => d.inflow),
          backgroundColor: '#16A34A',
          borderRadius: 6,
          barPercentage: 0.6,
        },
        {
          label: 'Outflows',
          data: dailySeries.map((d) => d.outflow),
          backgroundColor: '#DC2626',
          borderRadius: 6,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: { boxWidth: 10, usePointStyle: true, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.dataset.label}: ₦${Number(ctx.raw).toLocaleString('en-NG')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 12, color: '#94A3B8', font: { size: 11 } },
        },
        y: {
          border: { display: false },
          grid: {
            color: (context: any) => (context.tick.value === 0 ? '#E2E8F0' : 'transparent'),
          },
          ticks: {
            color: '#94A3B8',
            font: { size: 11 },
            callback: (v: any) => `₦${(Number(v) / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  };

  const bucketBorderColors: Record<string, string> = {
    tithe: 'var(--bucket-tithe)',
    kingdom: 'var(--bucket-kingdom)',
    savings: 'var(--bucket-savings)',
    invest: 'var(--bucket-invest)',
    charity: 'var(--bucket-charity)',
    expense: 'var(--bucket-expense)',
  };

  const currentDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div>
      {/* Top Bar with Search & Date */}
      <div className="top-bar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search transactions, accounts, or buckets..." readOnly />
        </div>

        <div className="date-pill">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{currentDateStr}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="screen-title">Money Movement</h2>
          <p className="screen-subtitle">Real-time bucket allocations, daily cash flow, and recent activity</p>
        </div>

        {/* Quick Actions (Matching UI_SYSTEM_DESIGN.md) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              padding: '9px 16px',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => alert('Add Transaction modal')}
          >
            <span>+</span> Add Transaction
          </button>
          <button
            style={{
              padding: '9px 14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '13px',
            }}
            onClick={() => alert('Transfer modal')}
          >
            Transfer
          </button>
        </div>
      </div>

      {/* Top Stat Card Row (Matching Section 12 rule: 3-4 cards across top of both dashboards) */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Allocated Funds"
          value={formatNgn(totalBucketFunds)}
          icon="₦"
          iconBg="rgba(37, 99, 235, 0.08)"
          iconColor="var(--color-primary)"
          subtext="Sum across all 6 buckets"
        />

        <KpiCard
          label="30-Day Total Inflow"
          value={formatNgn(totalInflows30)}
          icon="↓"
          iconBg="rgba(22, 163, 74, 0.08)"
          iconColor="var(--color-positive)"
          trend={{
            value: 'Inflows',
            direction: 'up',
          }}
        />

        <KpiCard
          label="30-Day Total Outflow"
          value={formatNgn(totalOutflows30)}
          icon="↑"
          iconBg="rgba(220, 38, 38, 0.08)"
          iconColor="var(--color-negative)"
          trend={{
            value: 'Outflows',
            direction: 'down',
          }}
        />

        <KpiCard
          label="30-Day Net Delta"
          value={`${netDelta30 >= 0 ? '+' : ''}${formatNgn(netDelta30)}`}
          icon="Δ"
          iconBg={netDelta30 >= 0 ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)'}
          iconColor={netDelta30 >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
          trend={{
            value: netDelta30 >= 0 ? 'Surplus' : 'Deficit',
            direction: netDelta30 >= 0 ? 'up' : 'down',
          }}
        />
      </div>

      {/* Six Bucket Balance Cards */}
      <div className="bucket-grid">
        {data.buckets.map((b) => (
          <div
            key={b.id}
            className="bucket-card"
            style={{ borderTopColor: bucketBorderColors[b.key] || 'var(--border-color)' }}
          >
            <div className="bucket-card-header">
              <span className="bucket-name">{b.name}</span>
              {b.is_pass_through === 1 && (
                <span className="pass-through-tag">Pass-through</span>
              )}
            </div>
            <div className="bucket-balance tabular-nums">{formatNgn(b.balance)}</div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {b.is_pass_through === 1 && b.balance > 0 ? (
                <span style={{ color: '#D97706', fontWeight: 600 }}>● Pending release</span>
              ) : b.is_pass_through === 1 ? (
                <span style={{ color: 'var(--color-positive)', fontWeight: 600 }}>✓ Released</span>
              ) : (
                <span>Available funds</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Daily Inflow / Outflow Bar Chart */}
      <div style={{ marginBottom: '24px' }}>
        <ChartCard
          title="Daily Inflow & Outflow Activity"
          subtitle="Cash movements over the past 30 days"
          config={inflowOutflowChartConfig}
        />
      </div>

      {/* Recent Transactions Feed (Matching Section 12 exact transaction row pattern) */}
      <div className="transaction-card">
        <div className="transaction-card-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Recent Transactions
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Latest activity across all accounts
            </p>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
            View Full History →
          </span>
        </div>

        {data.recent_transactions.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            No recent transactions recorded. Click "+ Add Transaction" to record your first transaction.
          </div>
        ) : (
          <div className="transaction-list">
            {data.recent_transactions.map((tx) => (
              <div key={tx.id} className="tx-row">
                <div className="tx-left">
                  <div className={`tx-circle ${tx.direction}`}>
                    {tx.direction === 'inflow' ? '↓' : '↑'}
                  </div>
                  <div className="tx-details">
                    <h4>{tx.note || tx.purpose_label || tx.category_name || 'Transaction'}</h4>
                    <p>
                      {tx.category_name || 'Inflow'} • {tx.date}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {tx.bucket_name && (
                    <BucketBadge bucketKey={tx.bucket_name.toLowerCase()} name={tx.bucket_name} />
                  )}
                  <div className={`tx-amount ${tx.direction}`}>
                    {tx.direction === 'inflow' ? '+' : '-'}{formatNgn(tx.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
