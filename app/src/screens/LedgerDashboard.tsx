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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', color: 'var(--text-muted)' }}>
        Loading Money Movement Dashboard...
      </div>
    );
  }

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 30-Day Inflow / Outflow daily bar chart (Matching OFX Image 2 style)
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
          borderRadius: 6,
          barPercentage: 0.6,
        },
        {
          label: 'Outflows',
          data: dailySeries.map((d) => d.outflow),
          backgroundColor: '#ef4444',
          borderRadius: 6,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
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
          ticks: { maxTicksLimit: 12, color: '#94a3b8', font: { size: 11 } },
        },
        y: {
          border: { dash: [4, 4] },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: (v: any) => `₦${(Number(v) / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  };

  const bucketBorderColors: Record<string, string> = {
    tithe: '#8b5cf6',
    kingdom: '#6366f1',
    savings: '#10b981',
    invest: '#2563eb',
    charity: '#f59e0b',
    expense: '#ef4444',
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 className="screen-title">Money Movement</h2>
          <p className="screen-subtitle">Real-time bucket allocations, daily cash flow, and recent activity</p>
        </div>

        {/* Quick Actions (Matching OFX / FinanceAI styling) */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--accent-primary)',
              color: '#ffffff',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            }}
            onClick={() => alert('Add Transaction modal')}
          >
            <span>+</span> Add Transaction
          </button>
          <button
            style={{
              padding: '10px 16px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '13px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
            }}
            onClick={() => alert('Transfer modal')}
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
                <span style={{ color: '#d97706', fontWeight: 600 }}>● Pending release</span>
              ) : b.is_pass_through === 1 ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Released</span>
              ) : (
                <span>Available funds</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Daily Inflow / Outflow Bar Chart */}
      <ChartCard
        title="Daily Inflow & Outflow Activity"
        subtitle="Last 30 days cash movement series"
        config={inflowOutflowChartConfig}
      />

      {/* Recent Transactions Table (Matching Image 1 table layout) */}
      <div className="transaction-card">
        <div className="transaction-card-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Recent Transactions
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Latest activity across all accounts
            </p>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer' }}>
            View All →
          </span>
        </div>

        {data.recent_transactions.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No transactions logged yet. Click "+ Add Transaction" to record your first inflow or expense.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="transaction-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Status / Bucket</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div className="tx-main">
                        <div className={`tx-icon-box ${tx.direction}`}>
                          {tx.direction === 'inflow' ? '↗' : '↘'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{tx.note || tx.purpose_label || tx.category_name || 'Transaction'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TXN-{tx.id.toString().padStart(4, '0')}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{tx.category_name || 'Inflow'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{tx.date}</td>
                    <td>
                      {tx.bucket_name ? (
                        <BucketBadge bucketKey={tx.bucket_name.toLowerCase()} name={tx.bucket_name} />
                      ) : (
                        <span className="status-pill">Completed</span>
                      )}
                    </td>
                    <td className={`amount-col ${tx.direction}`}>
                      {tx.direction === 'inflow' ? '+' : '-'}{formatNgn(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
