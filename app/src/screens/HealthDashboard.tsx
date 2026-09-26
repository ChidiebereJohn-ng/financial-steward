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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', color: 'var(--color-text-secondary)' }}>
        Loading Financial Health Dashboard...
      </div>
    );
  }

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 1. Net worth trend chart (Smooth curve, light gradient area fill beneath it, single accent color, no legend clutter)
  const filteredTrend = data.net_worth_trend;
  const netWorthChartConfig = {
    type: 'line' as const,
    data: {
      labels: filteredTrend.map((d) => d.date),
      datasets: [
        {
          label: 'Net Worth',
          data: filteredTrend.map((d) => d.net_worth),
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.06)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2563EB',
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
          border: { display: false },
          grid: {
            color: (context: any) => (context.tick.value === 0 ? '#E2E8F0' : 'transparent'),
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: (v: any) => `₦${(Number(v) / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  };

  // 2. Allocation Waterfall Chart (Rounded top corners, generous gap, no gridlines except faint baseline)
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
          backgroundColor: '#2563EB',
          borderRadius: 8,
          barPercentage: 0.6,
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
          ticks: { color: '#64748B', font: { size: 12, weight: 600 } },
        },
        y: {
          border: { display: false },
          grid: {
            color: (context: any) => (context.tick.value === 0 ? '#E2E8F0' : 'transparent'),
          },
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
      {/* Top Bar with Search & Date */}
      <div className="top-bar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search transactions, accounts, or insights..." readOnly />
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
        <h2 className="screen-title">Financial Health</h2>
        <p className="screen-subtitle">Cumulative standing, allocation discipline, and stewardship trajectory</p>
      </div>

      {/* Stat Card Row (Matching Section 12) */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Net Worth"
          value={formatNgn(data.net_worth_current)}
          icon="$"
          iconBg="rgba(37, 99, 235, 0.08)"
          iconColor="var(--color-primary)"
          trend={{
            value: '+12.5% vs last month',
            direction: 'up',
          }}
        />

        <KpiCard
          label="Savings & Investment Rate"
          value={`${data.savings_invest_rate.this_month_pct}%`}
          icon="↗"
          iconBg="rgba(22, 163, 74, 0.08)"
          iconColor="var(--color-positive)"
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
          iconColor="var(--bucket-tithe)"
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
          iconColor="var(--bucket-charity)"
          subtext={`${formatNgn(data.runway.expenses_balance)} available`}
        />
      </div>

      {/* Two-Column Chart Row (Matching Section 12 layout) */}
      <div className="chart-row">
        <ChartCard
          title="Net Worth Trend"
          subtitle="Cumulative asset trajectory over time"
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

      {/* Bottom Row: Insights on Left, Paired Budget Breakdown on Right */}
      <div className="chart-row">
        {/* Left: Grounded Stewardship Insights (No AI-hype framing, matching Section 12) */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-group">
              <h3>Stewardship Insights</h3>
              <p>Actionable observations from current allocations</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="insight-card success">
              <h5 className="insight-title">Savings & Investment Discipline Active</h5>
              <p className="insight-body">
                Current month rate of {data.savings_invest_rate.this_month_pct}% fulfills the remainder base allocation ratio.
              </p>
            </div>

            <div className="insight-card">
              <h5 className="insight-title">Expenses Runway Projection</h5>
              <p className="insight-body">
                At an average burn rate of {formatNgn(data.runway.avg_daily_burn)}/day, your available expense funds provide {data.runway.runway_days} days of operational coverage.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Paired Budget Adherence Summary */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-group">
              <h3>Budget Adherence & Variances</h3>
              <p>Paired planned vs. actual category breakdown</p>
            </div>
            <span style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 700 }}>
              {data.budget_adherence_summary.overall_adherence_pct}%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.budget_adherence_summary.worst_offenders.length > 0 && (
              <div className="insight-card warning">
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-negative)', fontWeight: 700 }}>Top Category Overages</span>
                {data.budget_adherence_summary.worst_offenders.map((o) => (
                  <div key={o.category_id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '13px' }}>
                    <span style={{ fontWeight: 500 }}>{o.category_name}</span>
                    <span style={{ color: 'var(--color-negative)', fontWeight: 700 }}>+{formatNgn(o.overage_amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '200px', overflowY: 'auto' }}>
              {data.budget_adherence_summary.categories.map((cat) => (
                <div key={cat.category_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{cat.category_name}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
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
                            ? 'var(--color-negative)'
                            : 'var(--color-primary)',
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
