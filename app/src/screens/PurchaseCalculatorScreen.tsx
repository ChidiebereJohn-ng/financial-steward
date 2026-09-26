import React, { useEffect, useState } from 'react';
import { KpiCard } from '../components/KpiCard';
import type { PurchaseCalculation, PurchaseRiskResult, PurchaseTier } from '../../../worker/types';

interface NetWorthSnapshot {
  net_worth: number;
  date: string;
  total_assets?: number;
  total_liabilities?: number;
}

export const PurchaseCalculatorScreen: React.FC = () => {
  const [itemName, setItemName] = useState('');
  const [costInput, setCostInput] = useState('');
  const [latestSnapshot, setLatestSnapshot] = useState<NetWorthSnapshot | null>(null);
  const [currentResult, setCurrentResult] = useState<PurchaseRiskResult | null>(null);
  const [history, setHistory] = useState<PurchaseCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadBenchmarkAndHistory();
  }, []);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const loadBenchmarkAndHistory = async () => {
    try {
      setLoading(true);
      // Fetch latest net worth snapshot
      const nwRes = await fetch('/api/net-worth?limit=1', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (nwRes.ok) {
        const nwData = await nwRes.json();
        const snapshots = nwData.snapshots || [];
        if (snapshots.length > 0) {
          setLatestSnapshot(snapshots[0]);
        } else {
          // Initialize baseline snapshot if none exists yet
          const initRes = await fetch('/api/net-worth/snapshot', {
            method: 'POST',
            headers: { 'x-dev-bypass': 'true' },
          });
          if (initRes.ok) {
            const initData = await initRes.json();
            setLatestSnapshot(initData.snapshot || initData);
          }
        }
      }

      // Fetch past purchase calculations
      const histRes = await fetch('/api/purchase-calculator/history?limit=50', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.calculations || []);
      }
    } catch (err) {
      console.error('Error loading purchase calculator data:', err);
      showFeedback('error', 'Unable to load snapshot or history');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(costInput.replace(/,/g, ''));

    if (!itemName.trim()) {
      showFeedback('error', 'Please enter an item name');
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      showFeedback('error', 'Please enter a valid positive cost amount');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/purchase-calculator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          item: itemName.trim(),
          cost,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Calculation failed');
      }

      const data = await res.json();
      setCurrentResult(data.calculation);
      showFeedback('success', `Evaluated "${data.calculation.item}": ${data.calculation.tier_result}`);

      // Refresh history
      loadBenchmarkAndHistory();
    } catch (err: any) {
      console.error('Calculation error:', err);
      showFeedback('error', err.message || 'Failed to evaluate purchase risk');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getTierVisuals = (tier: PurchaseTier) => {
    switch (tier) {
      case 'Safe':
        return {
          color: '#16a34a',
          bg: '#f0fdf4',
          border: '#bbf7d0',
          advice: 'Negligible impact on overall net worth (< 1%). Proceed comfortably within regular cash flow.',
        };
      case 'Comfortable':
        return {
          color: '#0d9488',
          bg: '#f0fdfa',
          border: '#99f6e4',
          advice: 'Minor footprint (< 5%). Safe if planned within monthly expenses bucket.',
        };
      case 'Major Purchase':
        return {
          color: '#2563eb',
          bg: '#eff6ff',
          border: '#bfdbfe',
          advice: 'Noticeable capital allocation (5–10%). Review whether cash is available in designated savings or expenses.',
        };
      case 'Good Reason to Purchase':
        return {
          color: '#d97706',
          bg: '#fffbeb',
          border: '#fde68a',
          advice: 'Significant commitment (10–20%). Ensure there is an essential lifestyle or business ROI reason.',
        };
      case 'Call a Family Member':
        return {
          color: '#ea580c',
          bg: '#fff7ed',
          border: '#fed7aa',
          advice: 'High-risk expenditure (20–30%). Sleep on this decision for 48 hours and consult an accountability partner.',
        };
      case 'Whatever You Bought Owns You':
        return {
          color: '#dc2626',
          bg: '#fef2f2',
          border: '#fecaca',
          advice: 'Severe net worth encroachment (30–50%). High risk of financial distress or liquid asset depletion.',
        };
      case 'Call Your Ancestors':
      default:
        return {
          color: '#7f1d1d',
          bg: '#450a0a',
          border: '#991b1b',
          advice: 'Critical danger (> 50% of net worth). Catastrophic financial risk—do not purchase without major asset liquidation or windfalls.',
        };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header & Sub-title */}
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
          Purchase Risk Calculator
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '14px' }}>
          Evaluate prospective outlays against your true net worth snapshot using the 7-tier stewardship risk scale.
        </p>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
            fontWeight: 500,
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Benchmark KPI Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <KpiCard
          label="Grounding Net Worth Snapshot"
          value={latestSnapshot ? formatCurrency(latestSnapshot.net_worth) : '₦0'}
          subtext={latestSnapshot ? `As of snapshot date: ${latestSnapshot.date}` : 'Calculating baseline...'}
          trend="neutral"
        />
        <KpiCard
          label="Total Historical Calculations"
          value={String(history.length)}
          subtext="Forensically logged purchase risk assessments"
          trend="neutral"
        />
      </div>

      {/* Two-Column Grid: Form on Left, Instant Result on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Input Form Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-card)',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0' }}>
            New Purchase Evaluation
          </h3>

          <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Item / Expense Description
              </label>
              <input
                type="text"
                placeholder="e.g. MacBook Pro, Vacation, Generator, Vehicle"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-page)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Estimated Cost (₦)
              </label>
              <input
                type="number"
                placeholder="e.g. 750000"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                required
                min="1"
                step="any"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-page)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: '8px',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Evaluating Risk Ratio...' : 'Calculate Purchase Risk'}
            </button>
          </form>

          {/* Preset Quick Tests */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
              Quick Presets:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={() => { setItemName('Espresso Machine'); setCostInput('85000'); }}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-page)', cursor: 'pointer' }}
              >
                Small Appliance (₦85k)
              </button>
              <button
                type="button"
                onClick={() => { setItemName('Workstation Laptop'); setCostInput('850000'); }}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-page)', cursor: 'pointer' }}
              >
                Tech Laptop (₦850k)
              </button>
              <button
                type="button"
                onClick={() => { setItemName('Pre-Owned Automobile'); setCostInput('4500000'); }}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-page)', cursor: 'pointer' }}
              >
                Vehicle (₦4.5M)
              </button>
            </div>
          </div>
        </div>

        {/* Visual Evaluation Result Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-card)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0' }}>
              Risk Assessment Result
            </h3>

            {currentResult ? (
              (() => {
                const visuals = getTierVisuals(currentResult.tier_result);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: 'var(--radius-card)',
                        backgroundColor: visuals.bg,
                        border: `1px solid ${visuals.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                          {currentResult.item}
                        </span>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            backgroundColor: visuals.color,
                            color: '#ffffff',
                          }}
                        >
                          {currentResult.tier_result}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '12px 0 6px 0' }}>
                        <span style={{ fontSize: '32px', fontWeight: 800, color: visuals.color }}>
                          {currentResult.ratio_pct.toFixed(1)}%
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          of Net Worth ({formatCurrency(currentResult.net_worth_at_time)})
                        </span>
                      </div>

                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
                        {visuals.advice}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ padding: '12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>Cost</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{formatCurrency(currentResult.cost)}</span>
                      </div>
                      <div style={{ padding: '12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>Evaluated On</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{currentResult.date}</span>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  background: 'var(--bg-page)',
                  borderRadius: 'var(--radius-card)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px auto', display: 'block', opacity: 0.5 }}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M7 15h0M2 9.5h20" />
                </svg>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
                  Enter an item and cost above to evaluate its financial impact.
                </p>
              </div>
            )}
          </div>

          {/* 7-Tier Scale Reference Card */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
              The 7-Tier Risk Thresholds:
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--color-text-secondary)' }}>
              <div>• <strong>&lt; 1%</strong>: Safe</div>
              <div>• <strong>1% – 5%</strong>: Comfortable</div>
              <div>• <strong>5% – 10%</strong>: Major Purchase</div>
              <div>• <strong>10% – 20%</strong>: Good Reason to Purchase</div>
              <div>• <strong>20% – 30%</strong>: Call a Family Member</div>
              <div>• <strong>30% – 50%</strong>: Whatever You Bought Owns You</div>
              <div>• <strong>&gt; 50%</strong>: Call Your Ancestors</div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Purchase Assessments Table */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-card)',
          padding: '24px',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
            Recent Risk Assessments ({history.length})
          </h3>
          <button
            onClick={loadBenchmarkAndHistory}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-page)',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading calculations...
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No purchase calculations logged yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Item</th>
                  <th style={{ padding: '10px 12px' }}>Cost</th>
                  <th style={{ padding: '10px 12px' }}>Net Worth Baseline</th>
                  <th style={{ padding: '10px 12px' }}>Ratio</th>
                  <th style={{ padding: '10px 12px' }}>Tier Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const visuals = getTierVisuals(h.tier_result);
                  return (
                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{h.date}</td>
                      <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{h.item}</td>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{formatCurrency(h.cost)}</td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatCurrency(h.net_worth_at_time)}</td>
                      <td style={{ padding: '12px', fontWeight: 700, color: visuals.color }}>{h.ratio_pct.toFixed(1)}%</td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: visuals.bg,
                            color: visuals.color,
                            border: `1px solid ${visuals.border}`,
                          }}
                        >
                          {h.tier_result}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
