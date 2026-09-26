import React, { useEffect, useState } from 'react';
import { ChartCard } from '../components/ChartCard';
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-muted)' }}>
        Loading Money Movement Dashboard...
      </div>
    );
  }

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 30-Day Inflow / Outflow daily bar chart
  const dailySeries = data.daily_series;
  const inflowOutflowChartConfig = {
    type: 'bar' as const,
    data: {
      labels: dailySeries.map((d) => d.date.slice(5)), // MM-DD
      datasets: [
        {
          label: 'Inflows',
          data: dailySeries.map((d) => d.inflow),
          backgroundColor: '#10b981',
          borderRadius: 4,
        },
        {
          label: 'Outflows',
          data: dailySeries.map((d) => d.outflow),
          backgroundColor: '#ef4444',
          borderRadius: 4,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.dataset.label}: ₦${Number(ctx.raw).toLocaleString('en-NG')}`,
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          ticks: { maxTicksLimit: 12 },
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            callback: (v: any) => `₦${(Number(v) / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  };

  // Bucket border colors
  const bucketBorderColors: Record<string, string> = {
    tithe: '#8b5cf6',
    kingdom: '#6366f1',
    savings: '#10b981',
    invest: '#3b82f6',
    charity: '#f59e0b',
    expense: '#ef4444',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h2 className="screen-title">Money Movement</h2>
          <p className="screen-subtitle">Real-time bucket allocations, daily cash flow, and recent activity</p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: '#0f172a',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => alert('Add Transaction modal will open (Module 4/UI expansion)')}
          >
            <span>+</span> Add Transaction
          </button>
          <button
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '13px',
            }}
            onClick={() => alert('Transfer modal will open (Module 4/UI expansion)')}
          >
            Transfer
          </button>
        </div>
      </div>

      {/* Six Bucket Balance Cards */}
      <div className="bucket-grid">
        {data.buckets.map((b) => (
          <div
            key={b.id}
            className="bucket-card"
            style={{ borderTopColor: bucketBorderColors[b.key] || '#94a3b8' }}
          >
            <div className="bucket-card-header">
              <span className="bucket-name">{b.name}</span>
              {b.is_pass_through === 1 && (
                <span className="pass-through-tag">Pass-through</span>
              )}
            </div>
            <div className="bucket-balance">{formatNgn(b.balance)}</div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {b.is_pass_through === 1 && b.balance > 0 ? (
                <span style={{ color: '#f59e0b' }}>● Pending release</span>
              ) : b.is_pass_through === 1 ? (
                <span>✓ Fully released</span>
              ) : (
                <span>Available funds</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Daily Inflow / Outflow Bar Chart */}
      <ChartCard
        title="Daily Inflow & Outflow Series (Last 30 Days)"
        config={inflowOutflowChartConfig}
      />

      {/* Recent 10 Transactions Feed */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Recent Activity
          </h3>
          <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer' }}>
            View Full History →
          </span>
        </div>

        <div className="transaction-list">
          {data.recent_transactions.length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No recent transactions recorded yet.
            </div>
          ) : (
            data.recent_transactions.map((tx) => (
              <div key={tx.id} className="tx-item">
                <div className="tx-left">
                  <div className={`tx-icon ${tx.direction}`}>
                    {tx.direction === 'inflow' ? '↓' : '↑'}
                  </div>
                  <div className="tx-info">
                    <h4>{tx.note || tx.purpose_label || tx.category_name || 'Transaction'}</h4>
                    <div className="tx-meta">
                      <span>{tx.date}</span>
                      {tx.category_name && <span>• {tx.category_name}</span>}
                      {tx.account_name && <span>• {tx.account_name}</span>}
                    </div>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};
