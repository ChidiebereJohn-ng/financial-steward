import React, { useEffect, useState, useMemo } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import { BucketBadge } from '../components/BucketBadge';
import type { OverallAdherenceResult, BudgetTrendItem, BudgetVarianceItem } from '../../../worker/types';

export const BudgetsScreen: React.FC = () => {
  const currentCalendarMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentCalendarMonth);
  const [budgetData, setBudgetData] = useState<OverallAdherenceResult | null>(null);
  const [trendData, setTrendData] = useState<BudgetTrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [plannedInputs, setPlannedInputs] = useState<Record<number, number>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchBudgets(selectedMonth);
    fetchTrend();
  }, [selectedMonth]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  const fetchBudgets = async (month: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/budgets?month=${month}`, {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json: OverallAdherenceResult = await res.json();
        setBudgetData(json);
        const inputs: Record<number, number> = {};
        for (const cat of json.categories) {
          inputs[cat.category_id] = cat.planned;
        }
        setPlannedInputs(inputs);
        setHasChanges(false);
      } else {
        showFeedback('error', 'Failed to retrieve monthly budget data');
      }
    } catch (err) {
      console.error('Error fetching budgets:', err);
      showFeedback('error', 'Network error connecting to Budgets API');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrend = async () => {
    try {
      const res = await fetch(`/api/budgets/trend`, {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setTrendData(json.series || []);
      }
    } catch (err) {
      console.error('Error fetching budget trend:', err);
    }
  };

  const handleStepMonth = (direction: -1 | 1) => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + direction;
    if (m === 0) {
      y -= 1;
      m = 12;
    } else if (m === 13) {
      y += 1;
      m = 1;
    }
    const nextMonth = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(nextMonth);
  };

  const handleInputChange = (categoryId: number, value: string) => {
    const parsed = parseFloat(value);
    const amount = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setPlannedInputs((prev) => ({
      ...prev,
      [categoryId]: amount,
    }));
    setHasChanges(true);
  };

  const handleSaveBudgets = async () => {
    if (!budgetData) return;
    try {
      setSaving(true);
      const items = budgetData.categories.map((c) => ({
        category_id: c.category_id,
        planned_amount: plannedInputs[c.category_id] ?? c.planned,
      }));

      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          month: selectedMonth,
          items,
        }),
      });

      if (res.ok) {
        showFeedback('success', `Budgets for ${selectedMonth} updated successfully`);
        await fetchBudgets(selectedMonth);
        await fetchTrend();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Failed to save budgets');
      }
    } catch (err) {
      console.error('Error saving budgets:', err);
      showFeedback('error', 'Error saving planned budgets');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPrevious = async () => {
    try {
      setCopying(true);
      const res = await fetch('/api/budgets/copy-previous', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          target_month: selectedMonth,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.count > 0) {
          showFeedback('success', `Copied ${json.count} categories from ${json.previous_month} into ${selectedMonth}`);
          await fetchBudgets(selectedMonth);
          await fetchTrend();
        } else {
          showFeedback('error', `No prior budgets found in ${json.previous_month} to copy`);
        }
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Failed to copy previous month budget');
      }
    } catch (err) {
      console.error('Error copying previous budget:', err);
      showFeedback('error', 'Error copying previous month budget');
    } finally {
      setCopying(false);
    }
  };

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatMonthTitle = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Planned vs. Actual Bar Chart Config (FinanceAI style: rounded tops, generous gaps, ₦ format)
  const comparisonChartConfig = useMemo(() => {
    if (!budgetData) return null;
    const categoriesWithData = budgetData.categories.filter((c) => c.planned > 0 || c.actual > 0);

    return {
      type: 'bar' as const,
      data: {
        labels: categoriesWithData.map((c) => c.category_name),
        datasets: [
          {
            label: 'Planned',
            data: categoriesWithData.map((c) => plannedInputs[c.category_id] ?? c.planned),
            backgroundColor: '#94a3b8',
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
          {
            label: 'Actual Spend',
            data: categoriesWithData.map((c) => c.actual),
            backgroundColor: categoriesWithData.map((c) => (c.actual > c.planned && c.planned > 0 ? '#dc2626' : '#2563EB')),
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            display: true,
            position: 'top' as const,
            align: 'end' as const,
            labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'circle' },
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
            ticks: { color: '#64748b', font: { size: 11 } },
          },
          y: {
            border: { display: false },
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#94a3b8',
              callback: (val: any) => `₦${Number(val).toLocaleString('en-NG')}`,
            },
          },
        },
      },
    };
  }, [budgetData, plannedInputs]);

  // Month-over-Month Adherence Trend Line Chart
  const trendChartConfig = useMemo(() => {
    if (trendData.length === 0) return null;

    return {
      type: 'line' as const,
      data: {
        labels: trendData.map((t) => t.month),
        datasets: [
          {
            label: 'Overall Adherence %',
            data: trendData.map((t) => t.overall_adherence_pct),
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
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
              label: (ctx: any) => `Adherence: ${ctx.raw}%`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 11 } },
          },
          y: {
            min: 0,
            max: 100,
            border: { display: false },
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#94a3b8',
              callback: (val: any) => `${val}%`,
            },
          },
        },
      },
    };
  }, [trendData]);

  if (loading && !budgetData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', color: 'var(--color-text-secondary)' }}>
        Loading Category Budgets & Adherence...
      </div>
    );
  }

  const netVariance = budgetData ? budgetData.total_actual - budgetData.total_planned : 0;

  return (
    <div className="budgets-screen">
      {/* Top Toolbar: Month Stepper + Quick Actions */}
      <div className="budgets-toolbar">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Budgets & Adherence
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Category variance tracking paired with honest adherence metrics
          </p>
        </div>

        <div className="budgets-actions">
          {/* Month Stepper */}
          <div className="month-stepper">
            <button
              className="month-stepper-btn"
              onClick={() => handleStepMonth(-1)}
              title="Previous Month"
            >
              ‹
            </button>
            <span className="month-stepper-label">{formatMonthTitle(selectedMonth)}</span>
            <button
              className="month-stepper-btn"
              onClick={() => handleStepMonth(1)}
              title="Next Month"
            >
              ›
            </button>
          </div>

          <button
            className="btn-secondary"
            onClick={handleCopyPrevious}
            disabled={copying || saving}
            title="Copy planned amounts from prior month"
          >
            {copying ? 'Copying...' : '⎘ Copy Last Month'}
          </button>

          <button
            className="btn-primary"
            onClick={handleSaveBudgets}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving...' : hasChanges ? '💾 Save Changes' : '✓ Saved'}
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className={`feedback-toast ${feedback.type}`}>
          {feedback.type === 'success' ? '✓ ' : '✕ '}
          {feedback.text}
        </div>
      )}

      {/* Paired Adherence Header (KPI quartet) */}
      {budgetData && (
        <div className="kpi-grid">
          <KpiCard
            label="Overall Adherence"
            value={`${budgetData.overall_adherence_pct}%`}
            icon="🎯"
            iconBg="rgba(37, 99, 235, 0.08)"
            iconColor="var(--color-primary)"
            trend={{
              value: budgetData.worst_offenders.length === 0 ? 'Disciplined' : `${budgetData.worst_offenders.length} Over Budget`,
              direction: budgetData.worst_offenders.length === 0 ? 'up' : 'down',
            }}
          />

          <KpiCard
            label="Total Planned"
            value={formatNgn(budgetData.total_planned)}
            icon="📋"
            iconBg="rgba(100, 116, 139, 0.08)"
            iconColor="var(--color-text-secondary)"
            subtext={`${budgetData.categories.filter((c) => c.planned > 0).length} budgeted categories`}
          />

          <KpiCard
            label="Total Actual Spend"
            value={formatNgn(budgetData.total_actual)}
            icon="💳"
            iconBg="rgba(220, 38, 38, 0.08)"
            iconColor="var(--color-negative)"
            subtext={`Across all outflow transactions`}
          />

          <KpiCard
            label="Net Variance"
            value={`${netVariance > 0 ? '+' : ''}${formatNgn(netVariance)}`}
            icon="⚖"
            iconBg="rgba(22, 163, 74, 0.08)"
            iconColor={netVariance <= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
            trend={{
              value: netVariance <= 0 ? 'Within budget' : 'Over budget',
              direction: netVariance <= 0 ? 'up' : 'down',
            }}
          />
        </div>
      )}

      {/* Paired Presentation Invariant: Worst Offenders Alert Banner */}
      {budgetData && budgetData.worst_offenders.length > 0 ? (
        <div className="offenders-banner">
          <div className="offenders-title">
            <span>⚠️</span>
            <span>Budget Variance Callout — {budgetData.worst_offenders.length} category overages driving down adherence:</span>
          </div>
          <div className="offenders-list">
            {budgetData.worst_offenders.map((off) => (
              <div key={off.category_id} className="offender-chip">
                <strong>{off.category_name}</strong>
                <span className="amount">+{formatNgn(off.overage_amount)}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  ({off.variance_pct > 0 ? `+${off.variance_pct}%` : 'Unbudgeted'})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="offenders-banner clean">
          <div className="offenders-title">
            <span>✓</span>
            <span>All categories are within planned limits for {formatMonthTitle(selectedMonth)}.</span>
          </div>
        </div>
      )}

      {/* Two-Column Chart Row */}
      <div className="chart-row">
        {comparisonChartConfig && (
          <ChartCard
            title="Planned vs. Actual Spend"
            subtitle={`Comparison across categories for ${formatMonthTitle(selectedMonth)}`}
            config={comparisonChartConfig}
          />
        )}

        {trendChartConfig && (
          <ChartCard
            title="MoM Adherence Trend"
            subtitle="Historical month-over-month overall adherence trajectory"
            config={trendChartConfig}
          />
        )}
      </div>

      {/* Category Variance Breakdown Table */}
      {budgetData && (
        <div className="budget-table-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Category Variance Breakdown
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Adjust planned amounts inline and track actual outflow spend per category
              </p>
            </div>
            {hasChanges && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>
                ● Unsaved Changes
              </span>
            )}
          </div>

          <table className="budget-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Bucket</th>
                <th style={{ width: '180px' }}>Planned (₦)</th>
                <th>Actual (₦)</th>
                <th>Variance</th>
                <th style={{ width: '180px' }}>Status & Pace</th>
              </tr>
            </thead>
            <tbody>
              {budgetData.categories.map((item: BudgetVarianceItem) => {
                const currentPlanned = plannedInputs[item.category_id] ?? item.planned;
                const ratio = currentPlanned > 0 ? (item.actual / currentPlanned) * 100 : item.actual > 0 ? 100 : 0;
                const barWidth = Math.min(100, ratio);

                let barColor = 'var(--color-positive)';
                if (ratio > 100) {
                  barColor = 'var(--color-negative)';
                } else if (ratio >= 80) {
                  barColor = '#f59e0b';
                }

                return (
                  <tr key={item.category_id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{item.category_name}</span>
                    </td>
                    <td>
                      {item.bucket_key ? (
                        <BucketBadge bucketKey={item.bucket_key} />
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="budget-input-wrapper">
                        <span className="budget-input-prefix">₦</span>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          className="budget-input"
                          value={currentPlanned === 0 ? '' : currentPlanned}
                          placeholder="0"
                          onChange={(e) => handleInputChange(item.category_id, e.target.value)}
                        />
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {formatNgn(item.actual)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${item.status}`}>
                        {item.variance_pct > 0 ? `+${item.variance_pct}%` : `${item.variance_pct}%`}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          <span>{Math.round(ratio)}% spent</span>
                          {item.overage_amount > 0 && (
                            <span style={{ color: 'var(--color-negative)', fontWeight: 600 }}>
                              +{formatNgn(item.overage_amount)}
                            </span>
                          )}
                        </div>
                        <div className="progress-container">
                          <div
                            className="progress-bar"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
