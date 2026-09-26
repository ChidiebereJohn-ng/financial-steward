import React, { useEffect, useState } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import { BucketBadge } from '../components/BucketBadge';
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-muted)' }}>
        Loading Financial Health Dashboard...
      </div>
    );
  }

  // Currency formatter
  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 1. Net worth trend chart configuration
  const filteredTrend = data.net_worth_trend; // Can slice based on timeRange
  const netWorthChartConfig = {
    type: 'line' as const,
    data: {
      labels: filteredTrend.map((d) => d.date),
      datasets: [
        {
          label: 'Net Worth (NGN)',
          data: filteredTrend.map((d) => d.net_worth),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
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
          ticks: { maxTicksLimit: 8 },
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

  // 2. Allocation waterfall chart configuration (stacked bar / horizontal bar)
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
          backgroundColor: [
            '#8b5cf6', // Tithe
            '#6366f1', // Kingdom
            '#10b981', // Savings
            '#3b82f6', // Invest
            '#f59e0b', // Charity
            '#ef4444', // Expense
          ],
          borderRadius: 6,
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

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">Financial Health</h2>
        <p className="screen-subtitle">Cumulative standing, allocation discipline, and stewardship trajectory</p>
      </div>

      {/* Honest Row of KPIs */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Net Worth"
          value={formatNgn(data.net_worth_current)}
          subtext="Base Currency (NGN)"
        />

        <KpiCard
          label="Savings & Investment Rate"
          value={`${data.savings_invest_rate.this_month_pct}%`}
          trend={{
            value: `${Math.abs(data.savings_invest_rate.change_pct)}% MoM`,
            direction: data.savings_invest_rate.change_pct >= 0 ? 'up' : 'down',
          }}
          subtext={`Prior Month: ${data.savings_invest_rate.last_month_pct}%`}
        />

        <KpiCard
          label="Budget Adherence"
          value={`${data.budget_adherence_summary.overall_adherence_pct}%`}
          subtext={`${data.budget_adherence_summary.worst_offenders.length} category overages`}
        />

        <KpiCard
          label="Expenses Runway"
          value={`≈ ${data.runway.runway_days} Days`}
          subtext={`${formatNgn(data.runway.expenses_balance)} available (${formatNgn(data.runway.avg_daily_burn)}/day burn)`}
        />
      </div>

      {/* Chart 1: Net Worth Trend */}
      <ChartCard
        title="Net Worth History & Cumulative Trajectory"
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {/* Chart 2: This Month's Allocation Waterfall */}
        <ChartCard
          title={`Allocation Waterfall (${data.allocation_waterfall.month})`}
          config={waterfallChartConfig}
        />

        {/* Paired Budget Adherence Breakdown */}
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="chart-header">
            <h3 className="chart-title">Budget Adherence Summary</h3>
            <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600 }}>
              {data.budget_adherence_summary.overall_adherence_pct}% Adherence
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {data.budget_adherence_summary.worst_offenders.length > 0 && (
              <div style={{ marginBottom: '8px', padding: '10px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#ef4444', fontWeight: 700 }}>Worst Overages</span>
                <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {data.budget_adherence_summary.worst_offenders.map((o) => (
                    <div key={o.category_id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span>{o.category_name}</span>
                      <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>+{formatNgn(o.overage_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '220px', overflowY: 'auto' }}>
              {data.budget_adherence_summary.categories.map((cat) => (
                <div key={cat.category_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{cat.category_name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
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
                            : cat.planned > 0 && cat.actual > cat.planned * 0.85
                            ? '#f59e0b'
                            : '#10b981',
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
