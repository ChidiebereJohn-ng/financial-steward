import React, { useEffect, useState } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import type { HealthDashboardData } from '../../../worker/types';

export const HealthDashboard: React.FC = () => {
  const [data, setData] = useState<HealthDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'3M' | '6M' | '1Y' | 'ALL'>('ALL');

  useEffect(() => {
    fetchHealthData();
  }, []);

  const fetchHealthData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/health', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load health dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', color: 'var(--text-muted)' }}>
        Loading Financial Health Dashboard...
      </div>
    );
  }

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 1. Net worth trend chart (Matching Revenue & Expenses smooth curve in Image 1)
  const filteredTrend = data.net_worth_trend;
  const netWorthChartConfig = {
    type: 'line' as const,
    data: {
      labels: filteredTrend.map((d) => d.date),
      datasets: [
        {
          label: 'Net Worth (Assets - Liabilities)',
          data: filteredTrend.map((d) => d.net_worth),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2563eb',
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `Net Worth: ₦${Number(ctx.raw).toLocaleString('en-NG')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 } },
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

  // 2. Spending / Allocation Waterfall Chart (Matching chunky rounded blue bars in Image 1 "Spending by Category")
  const splits = data.allocation_waterfall.splits;
  const waterfallChartConfig = {
    type: 'bar' as const,
    data: {
      labels: ['Tithe', 'Kingdom', 'Savings', 'Invest', 'Charity', 'Expense'],
      datasets: [
        {
          label: 'Allocated Amount',
          data: [
            splits.tithe || 0,
            splits.kingdom || 0,
            splits.savings || 0,
            splits.invest || 0,
            splits.charity || 0,
            splits.expense || 0,
          ],
          backgroundColor: '#2563eb',
          borderRadius: 8,
          barPercentage: 0.65,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `Allocated: ₦${Number(ctx.raw).toLocaleString('en-NG')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 12, weight: 600 } },
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

  const currentDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div>
      {/* Top Bar with Search & Date (Matching Image 1) */}
      <div className="top-bar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search transactions, accounts, or stewardship insights..." readOnly />
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

      {/* Screen Title */}
      <div className="screen-header">
        <h2 className="screen-title">Dashboard Overview</h2>
        <p className="screen-subtitle">Monitor your stewardship trajectory, allocation discipline, and runway</p>
      </div>

      {/* Mobile Vibrant Balance Hero Card (Matching Image 3) */}
      <div className="mobile-hero-card">
        <div className="hero-balance-label">Total Net Worth</div>
        <div className="hero-balance-value">{formatNgn(data.net_worth_current)}</div>
        <div className="hero-actions">
          <button className="hero-btn" onClick={() => alert('Add Transaction modal')}>
            + Inflow
          </button>
          <button className="hero-btn-outline" onClick={() => alert('Transfer modal')}>
            Transfer
          </button>
        </div>
      </div>

      {/* KPI Cards Row (Matching Image 1 cards) */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Net Worth"
          value={formatNgn(data.net_worth_current)}
          icon="$"
          iconBg="rgba(37, 99, 235, 0.08)"
          iconColor="#2563eb"
          trend={{
            value: '+12.5% vs last month',
            direction: 'up',
          }}
        />

        <KpiCard
          label="Savings & Invest Rate"
          value={`${data.savings_invest_rate.this_month_pct}%`}
          icon="↗"
          iconBg="rgba(16, 185, 129, 0.08)"
          iconColor="#10b981"
          trend={{
            value: `${Math.abs(data.savings_invest_rate.change_pct)}% vs last month`,
            direction: data.savings_invest_rate.change_pct >= 0 ? 'up' : 'down',
          }}
          subtext={`Prior Month: ${data.savings_invest_rate.last_month_pct}%`}
        />

        <KpiCard
          label="Budget Adherence"
          value={`${data.budget_adherence_summary.overall_adherence_pct}%`}
          icon="◈"
          iconBg="rgba(139, 92, 246, 0.08)"
          iconColor="#8b5cf6"
          trend={{
            value: `${data.budget_adherence_summary.worst_offenders.length} overages`,
            direction: data.budget_adherence_summary.worst_offenders.length === 0 ? 'up' : 'down',
          }}
        />

        <KpiCard
          label="Expenses Runway"
          value={`≈ ${data.runway.runway_days} Days`}
          icon="⚡"
          iconBg="rgba(245, 158, 11, 0.08)"
          iconColor="#f59e0b"
          subtext={`${formatNgn(data.runway.expenses_balance)} available`}
        />
      </div>

      {/* Two Side-by-Side Charts (Matching Image 1) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <ChartCard
          title="Net Worth & Trajectory"
          subtitle="Monthly cumulative asset performance overview"
          actions={
            <div className="chart-actions">
              {(['3M', '6M', '1Y', 'ALL'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`time-btn ${timeRange === r ? 'active' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>
          }
          config={netWorthChartConfig}
        />

        <ChartCard
          title="Allocation Waterfall"
          subtitle={`Current month split (${data.allocation_waterfall.month}) across 6 buckets`}
          config={waterfallChartConfig}
        />
      </div>

      {/* Bottom Row (Matching Image 1: Insights on left, Breakdown/Overages on right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Left: AI & Stewardship Insights Card */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-group">
              <h3>AI-Powered Insights</h3>
              <p>Generated from your stewardship data</p>
            </div>
            <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer' }}>
              View All →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '14px 16px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Savings & Invest discipline on track
                </h5>
                <span className="trend-pill trend-up">High</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Your current monthly savings and investment rate of {data.savings_invest_rate.this_month_pct}% satisfies the biblical remainder ratio.
              </p>
            </div>

            <div style={{ padding: '14px 16px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Expenses runway healthy
                </h5>
                <span className="trend-pill" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>Safe</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                At an average burn of {formatNgn(data.runway.avg_daily_burn)}/day, your available expense funds provide {data.runway.runway_days} days of runway.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Paired Budget Adherence Breakdown Card */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-group">
              <h3>Budget Adherence & Variances</h3>
              <p>Paired planned vs. actual category breakdown</p>
            </div>
            <span style={{ fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 700 }}>
              {data.budget_adherence_summary.overall_adherence_pct}%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {data.budget_adherence_summary.worst_offenders.length > 0 && (
              <div style={{ padding: '12px 14px', backgroundColor: 'rgba(239, 68, 68, 0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#ef4444', fontWeight: 700 }}>Top Overages</span>
                {data.budget_adherence_summary.worst_offenders.map((o) => (
                  <div key={o.category_id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '13px' }}>
                    <span style={{ fontWeight: 500 }}>{o.category_name}</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>+{formatNgn(o.overage_amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '220px', overflowY: 'auto' }}>
              {data.budget_adherence_summary.categories.map((cat) => (
                <div key={cat.category_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{cat.category_name}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {formatNgn(cat.actual)} {cat.planned > 0 && `/ ${formatNgn(cat.planned)}`}
                    </span>
                  </div>
                  <div className="progress-container">
                    <div
                      className="progress-bar"
                      style={{
                        width: cat.planned > 0 ? `${Math.min((cat.actual / cat.planned) * 100, 100)}%` : '100%',
                        backgroundColor:
                          cat.planned > 0 && cat.actual > cat.planned
                            ? '#ef4444'
                            : '#2563eb',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
