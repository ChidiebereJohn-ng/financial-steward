import React, { useEffect, useState, useMemo } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import type {
  CompoundingSimulationResult,
  InvestmentWithGainLoss,
  PortfolioSummary,
  StrategyWithStages,
} from '../../../worker/types';

export const InvestorScreen: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'holdings' | 'simulator'>('holdings');
  const [selectedMarket, setSelectedMarket] = useState<string>('all');
  const [investments, setInvestments] = useState<InvestmentWithGainLoss[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [strategies, setStrategies] = useState<StrategyWithStages[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<InvestmentWithGainLoss | null>(null);
  const [priceUpdateTarget, setPriceUpdateTarget] = useState<InvestmentWithGainLoss | null>(null);

  // Add/Edit holding form state
  const [symbolOrName, setSymbolOrName] = useState('');
  const [type, setType] = useState('equity');
  const [market, setMarket] = useState('NGX');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [costBasis, setCostBasis] = useState<number | ''>('');
  const [currency, setCurrency] = useState('NGN');
  const [currentValue, setCurrentValue] = useState<number | ''>('');
  const [initialPrice, setInitialPrice] = useState<number | ''>('');
  const [strategyId, setStrategyId] = useState<number | ''>('');
  const [submittingHolding, setSubmittingHolding] = useState(false);

  // Price update modal form state
  const [updatePrice, setUpdatePrice] = useState<number | ''>('');
  const [updateDate, setUpdateDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [updateSource, setUpdateSource] = useState<'manual' | 'api'>('manual');
  const [submittingPrice, setSubmittingPrice] = useState(false);

  // Simulator state
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('1');
  const [startingCapital, setStartingCapital] = useState<number>(1000000);
  const [customStages, setCustomStages] = useState<Array<{ stage_order: number; asset_type: string; duration_months: number; expected_return_pct: number }>>([
    { stage_order: 1, asset_type: 'Money Market Fund', duration_months: 6, expected_return_pct: 14.5 },
    { stage_order: 2, asset_type: 'FGN Treasury Bill', duration_months: 12, expected_return_pct: 18.0 },
  ]);
  const [simulationResult, setSimulationResult] = useState<CompoundingSimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    fetchInvestments();
    fetchStrategies();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const fetchInvestments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/investments', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setInvestments(json.investments || []);
        setSummary(json.summary || null);
      } else {
        showToast('error', 'Failed to retrieve investment holdings');
      }
    } catch (err) {
      console.error('Error fetching investments:', err);
      showToast('error', 'Network error connecting to Investor API');
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategies = async () => {
    try {
      const res = await fetch('/api/strategies', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setStrategies(json.strategies || []);
        if (json.strategies?.length > 0 && selectedStrategyId === '1') {
          // Trigger initial simulation with first strategy
          runSimulation(json.strategies[0].id, 1000000);
        }
      }
    } catch (err) {
      console.error('Error fetching strategies:', err);
    }
  };

  const runSimulation = async (stratId: number | 'custom', capital: number) => {
    try {
      setSimulating(true);
      if (stratId === 'custom') {
        const res = await fetch('/api/strategies/simulate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            starting_capital: capital,
            stages: customStages,
            strategy_name: 'Custom Staged Strategy',
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSimulationResult(json);
        }
      } else {
        const res = await fetch(`/api/strategies/${stratId}/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            starting_capital: capital,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSimulationResult(json);
        }
      }
    } catch (err) {
      console.error('Simulation error:', err);
      showToast('error', 'Error calculating compounding projection');
    } finally {
      setSimulating(false);
    }
  };

  // Filtered investments list
  const filteredInvestments = useMemo(() => {
    if (selectedMarket === 'all') return investments;
    return investments.filter((i) => (i.market || '').toLowerCase() === selectedMarket.toLowerCase());
  }, [investments, selectedMarket]);

  // Handle open add holding
  const handleOpenAddHolding = () => {
    setEditingHolding(null);
    setSymbolOrName('');
    setType('equity');
    setMarket('NGX');
    setQuantity('');
    setCostBasis('');
    setCurrency('NGN');
    setCurrentValue('');
    setInitialPrice('');
    setStrategyId('');
    setShowAddModal(true);
  };

  // Handle open edit holding
  const handleOpenEditHolding = (h: InvestmentWithGainLoss) => {
    setEditingHolding(h);
    setSymbolOrName(h.symbol_or_name);
    setType(h.type);
    setMarket(h.market);
    setQuantity(h.quantity !== null ? h.quantity : '');
    setCostBasis(h.cost_basis);
    setCurrency(h.currency);
    setCurrentValue(h.current_value !== null ? h.current_value : '');
    setInitialPrice(h.latest_price !== null ? h.latest_price : '');
    setStrategyId(h.strategy_id || '');
    setShowAddModal(true);
  };

  // Handle submit holding (add or edit)
  const handleSubmitHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbolOrName.trim()) {
      showToast('error', 'Symbol or asset name is required');
      return;
    }
    if (costBasis === '' || Number(costBasis) < 0) {
      showToast('error', 'Valid cost basis is required');
      return;
    }

    try {
      setSubmittingHolding(true);
      const payload: any = {
        symbol_or_name: symbolOrName.trim().toUpperCase(),
        type,
        market,
        cost_basis: Number(costBasis),
        currency: currency.toUpperCase(),
        quantity: quantity !== '' ? Number(quantity) : null,
        current_value: currentValue !== '' ? Number(currentValue) : null,
        strategy_id: strategyId ? Number(strategyId) : null,
      };

      if (!editingHolding && initialPrice !== '') {
        payload.initial_price = Number(initialPrice);
      }

      const url = editingHolding ? `/api/investments/${editingHolding.id}` : '/api/investments';
      const method = editingHolding ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('success', editingHolding ? 'Holding updated' : 'Holding successfully added');
        setShowAddModal(false);
        fetchInvestments();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to save holding');
      }
    } catch (err) {
      console.error('Error saving holding:', err);
      showToast('error', 'Network error saving holding');
    } finally {
      setSubmittingHolding(false);
    }
  };

  // Handle delete holding
  const handleDeleteHolding = async (id: number, symbol: string) => {
    if (!confirm(`Are you sure you want to remove ${symbol} from your portfolio?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/investments/${id}`, {
        method: 'DELETE',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        showToast('success', `${symbol} removed from portfolio`);
        fetchInvestments();
      } else {
        showToast('error', 'Failed to remove holding');
      }
    } catch (err) {
      console.error('Error deleting holding:', err);
      showToast('error', 'Network error removing holding');
    }
  };

  // Handle open price update modal
  const handleOpenPriceModal = (h: InvestmentWithGainLoss) => {
    setPriceUpdateTarget(h);
    setUpdatePrice(h.latest_price !== null ? h.latest_price : (h.quantity && h.current_value ? h.current_value / h.quantity : ''));
    setUpdateDate(new Date().toISOString().split('T')[0]);
    setUpdateSource(h.market === 'NGX' ? 'manual' : 'api');
    setShowPriceModal(true);
  };

  // Handle submit price update
  const handleSubmitPriceUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceUpdateTarget || updatePrice === '' || Number(updatePrice) < 0) {
      showToast('error', 'Valid unit price is required');
      return;
    }

    try {
      setSubmittingPrice(true);
      const res = await fetch(`/api/investments/${priceUpdateTarget.id}/price-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          price: Number(updatePrice),
          date: updateDate,
          source: updateSource,
        }),
      });

      if (res.ok) {
        showToast('success', `Price updated for ${priceUpdateTarget.symbol_or_name}`);
        setShowPriceModal(false);
        fetchInvestments();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to update price');
      }
    } catch (err) {
      console.error('Error updating price:', err);
      showToast('error', 'Network error submitting price update');
    } finally {
      setSubmittingPrice(false);
    }
  };

  // Chart configuration for Strategy Simulator
  const simulationChartConfig = useMemo(() => {
    if (!simulationResult || simulationResult.timeline.length === 0) {
      return {
        type: 'line' as const,
        data: { labels: [], datasets: [] },
      };
    }

    const labels = ['Starting Capital', ...simulationResult.timeline.map((t, idx) => `Stage ${idx + 1}: ${t.asset_type} (${t.duration_months}m)`)];
    const dataPoints = [simulationResult.starting_capital, ...simulationResult.timeline.map((t) => t.ending_capital)];

    return {
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          {
            label: 'Projected Capital (₦)',
            data: dataPoints,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#10b981',
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => ` Capital: ₦${Number(context.raw).toLocaleString()}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (val: any) => `₦${(val / 1000).toLocaleString()}k`,
            },
            grid: { color: 'rgba(226, 232, 240, 0.5)' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    };
  }, [simulationResult]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Toast Feedback */}
      {feedback && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: feedback.type === 'success' ? '#059669' : '#dc2626',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '13px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Header & Sub-Tab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
            Investor Module (Screen 7)
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px' }}>
            Multi-market portfolio valuation, NGX manual journal, live crypto proxy, & staged compounding simulator.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setActiveSubTab('holdings')}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: activeSubTab === 'holdings' ? 'var(--color-primary)' : 'var(--bg-card)',
              color: activeSubTab === 'holdings' ? '#ffffff' : 'var(--color-text-secondary)',
              border: `1px solid ${activeSubTab === 'holdings' ? 'var(--color-primary)' : 'var(--border-color)'}`,
              cursor: 'pointer',
            }}
          >
            Holdings & Portfolio
          </button>
          <button
            onClick={() => setActiveSubTab('simulator')}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: activeSubTab === 'simulator' ? 'var(--color-primary)' : 'var(--bg-card)',
              color: activeSubTab === 'simulator' ? '#ffffff' : 'var(--color-text-secondary)',
              border: `1px solid ${activeSubTab === 'simulator' ? 'var(--color-primary)' : 'var(--border-color)'}`,
              cursor: 'pointer',
            }}
          >
            Strategy Simulator
          </button>
        </div>
      </div>

      {activeSubTab === 'holdings' ? (
        <>
          {/* Summary Stat KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <KpiCard
              label="Total Portfolio Value"
              value={`₦${(summary?.total_portfolio_value_ngn || 0).toLocaleString()}`}
              subtext="Aggregated across all markets converted to NGN"
              icon={<span>💼</span>}
            />
            <KpiCard
              label="Total Unrealized Gain / Loss"
              value={`${(summary?.total_gain_loss_ngn || 0) >= 0 ? '+' : ''}₦${(summary?.total_gain_loss_ngn || 0).toLocaleString()}`}
              subtext={`Cost basis: ₦${(summary?.total_cost_basis_ngn || 0).toLocaleString()}`}
              trend={{
                value: `${(summary?.total_gain_loss_pct || 0) >= 0 ? '+' : ''}${summary?.total_gain_loss_pct || 0}%`,
                direction: (summary?.total_gain_loss_pct || 0) >= 0 ? 'up' : 'down',
              }}
              iconBg={(summary?.total_gain_loss_pct || 0) >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
              iconColor={(summary?.total_gain_loss_pct || 0) >= 0 ? '#10b981' : '#ef4444'}
              icon={<span>{(summary?.total_gain_loss_pct || 0) >= 0 ? '📈' : '📉'}</span>}
            />
            <KpiCard
              label="Market Allocation"
              value={`${investments.length} Positions`}
              subtext={`NGX: ${summary?.markets.ngx.count || 0} | Global: ${summary?.markets.global.count || 0} | Crypto: ${summary?.markets.crypto.count || 0}`}
              icon={<span>🌐</span>}
            />
          </div>

          {/* Action Row & Market Filter Tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'all', label: 'All Markets' },
                { id: 'ngx', label: 'NGX Equities & Fixed Income' },
                { id: 'global', label: 'Global Equities' },
                { id: 'crypto', label: 'Crypto' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedMarket(tab.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: selectedMarket === tab.id ? 'var(--color-primary)' : 'var(--bg-card)',
                    color: selectedMarket === tab.id ? '#ffffff' : 'var(--text-muted)',
                    border: `1px solid ${selectedMarket === tab.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleOpenAddHolding}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              + Add Holding
            </button>
          </div>

          {/* Holdings Table Card */}
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading investment holdings...
              </div>
            ) : filteredInvestments.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ margin: '0 0 12px 0', fontSize: '15px' }}>No holdings found in this market category.</p>
                <button
                  onClick={handleOpenAddHolding}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Add Your First Holding
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Asset</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Market / Type</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Quantity</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Cost Basis</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Current Value</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Unrealized Gain / Loss</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Price Source</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvestments.map((h) => {
                      const isGain = h.unrealized_gain_loss >= 0;
                      const currSymbol = h.currency === 'USD' ? '$' : h.currency === 'EUR' ? '€' : '₦';

                      return (
                        <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            <div>{h.symbol_or_name}</div>
                            {h.strategy_name && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                                🎯 {h.strategy_name}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: h.market === 'NGX' ? 'rgba(37, 99, 235, 0.1)' : h.market === 'crypto' ? 'rgba(234, 88, 12, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                color: h.market === 'NGX' ? '#2563eb' : h.market === 'crypto' ? '#ea580c' : '#10b981',
                                marginRight: '6px',
                              }}
                            >
                              {h.market}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{h.type}</span>
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>
                            {h.quantity !== null ? h.quantity.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>
                            {currSymbol}{h.cost_basis.toLocaleString()}
                          </td>
                          <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {currSymbol}{(h.current_value ?? h.cost_basis).toLocaleString()}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor: isGain ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: isGain ? '#10b981' : '#ef4444',
                              }}
                            >
                              {isGain ? '▲' : '▼'} {currSymbol}{Math.abs(h.unrealized_gain_loss).toLocaleString()} ({isGain ? '+' : ''}{h.unrealized_gain_loss_pct}%)
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: h.price_source === 'manual' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                color: h.price_source === 'manual' ? '#d97706' : '#7c3aed',
                              }}
                            >
                              {h.price_source === 'manual' ? '📝 Manual Journal' : '⚡ Live Price'}
                            </span>
                            {h.latest_price !== null && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                @ {currSymbol}{h.latest_price.toLocaleString()} ({h.latest_price_date || 'latest'})
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                onClick={() => handleOpenPriceModal(h)}
                                title="Log price update"
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                  color: 'var(--color-primary)',
                                  border: 'none',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Update Price
                              </button>
                              <button
                                onClick={() => handleOpenEditHolding(h)}
                                title="Edit holding"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: 'transparent',
                                  color: 'var(--text-muted)',
                                  border: '1px solid var(--border-color)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                }}
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteHolding(h.id, h.symbol_or_name)}
                                title="Delete holding"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: 'transparent',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.2)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                }}
                              >
                                🗑️
                              </button>
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
        </>
      ) : (
        /* Strategy Simulator Sub-screen */
        <div>
          {/* Prominent Mandatory Disclaimer Banner */}
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#b45309', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Projection, not a live position
              </div>
              <div style={{ fontSize: '13px', color: '#92400e', marginTop: '2px' }}>
                Staged compounding curves simulate projected capital progression using sequential stage yields: Capital_k = Capital_(k-1) × (1 + Return_k). This tool provides forward stewardship models, not guaranteed live investment positions.
              </div>
            </div>
          </div>

          {/* Simulator Control Card */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Select Staged Strategy Template
                </label>
                <select
                  value={selectedStrategyId}
                  onChange={(e) => {
                    setSelectedStrategyId(e.target.value);
                    if (e.target.value !== 'custom') {
                      runSimulation(Number(e.target.value), startingCapital);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.stages.length} Stages)
                    </option>
                  ))}
                  <option value="custom">✏️ Custom Stage Sequence Builder</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Starting Capital (₦)
                </label>
                <input
                  type="number"
                  min="1000"
                  step="10000"
                  value={startingCapital}
                  onChange={(e) => setStartingCapital(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <button
                  onClick={() => runSimulation(selectedStrategyId === 'custom' ? 'custom' : Number(selectedStrategyId), startingCapital)}
                  disabled={simulating}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: simulating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {simulating ? 'Computing Projection...' : 'Recalculate Projection'}
                </button>
              </div>
            </div>

            {/* Custom Stages Builder */}
            {selectedStrategyId === 'custom' && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>Custom Strategy Stages</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStages([
                        ...customStages,
                        { stage_order: customStages.length + 1, asset_type: 'Equities', duration_months: 12, expected_return_pct: 20.0 },
                      ]);
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(37, 99, 235, 0.1)',
                      color: 'var(--color-primary)',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Add Stage
                  </button>
                </div>

                {customStages.map((st, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, width: '60px' }}>Stage {idx + 1}</span>
                    <input
                      type="text"
                      placeholder="Asset Type (e.g. Mutual Fund)"
                      value={st.asset_type}
                      onChange={(e) => {
                        const copy = [...customStages];
                        copy[idx].asset_type = e.target.value;
                        setCustomStages(copy);
                      }}
                      style={{
                        flex: 2,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px',
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Duration (Months)"
                      value={st.duration_months}
                      onChange={(e) => {
                        const copy = [...customStages];
                        copy[idx].duration_months = Number(e.target.value);
                        setCustomStages(copy);
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px',
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Expected Return (%)"
                      value={st.expected_return_pct}
                      onChange={(e) => {
                        const copy = [...customStages];
                        copy[idx].expected_return_pct = Number(e.target.value);
                        setCustomStages(copy);
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px',
                      }}
                    />
                    {customStages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomStages(customStages.filter((_, i) => i !== idx));
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '6px',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Simulation Output KPIs & Chart */}
          {simulationResult && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <KpiCard
                  label="Starting Capital"
                  value={`₦${simulationResult.starting_capital.toLocaleString()}`}
                  subtext="Initial capital injection"
                  icon={<span>🌱</span>}
                />
                <KpiCard
                  label="Projected Final Capital"
                  value={`₦${simulationResult.final_capital.toLocaleString()}`}
                  subtext={`Horizon: ${simulationResult.total_duration_months} months (${(simulationResult.total_duration_months / 12).toFixed(1)} yrs)`}
                  icon={<span>🚀</span>}
                />
                <KpiCard
                  label="Total Projected Gain"
                  value={`+₦${simulationResult.total_gain.toLocaleString()}`}
                  trend={{
                    value: `+${simulationResult.total_return_pct}%`,
                    direction: 'up',
                  }}
                  iconBg="rgba(16, 185, 129, 0.1)"
                  iconColor="#10b981"
                  icon={<span>📈</span>}
                />
              </div>

              {/* Chart Card */}
              <div style={{ marginBottom: '24px' }}>
                <ChartCard
                  title={`Compounding Capital Curve — ${simulationResult.strategy_name}`}
                  subtitle='Staged simulation curve | Stamped: "Projection, not a live position"'
                  config={simulationChartConfig}
                  height={320}
                />
              </div>

              {/* Timeline Stages Table */}
              <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
                  Stage-by-Stage Progression Breakdown
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Stage</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Asset Vehicle</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Duration</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Stage Return</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Starting Capital</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Stage Gain</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Ending Capital</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulationResult.timeline.map((item) => (
                      <tr key={item.stage_order} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>Stage {item.stage_order}</td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{item.asset_type}</td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          {item.duration_months} mo (cum. {item.cumulative_months}m)
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#10b981' }}>
                          +{item.expected_return_pct}%
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          ₦{item.starting_capital.toLocaleString()}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#10b981', fontWeight: 600 }}>
                          +₦{item.gain_amount.toLocaleString()}
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          ₦{item.ending_capital.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Holding Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>
                {editingHolding ? 'Edit Holding' : 'Add Investment Holding'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitHolding}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Symbol or Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DANGCEM, BTC, VOO, Treasury Bill #1"
                  value={symbolOrName}
                  onChange={(e) => setSymbolOrName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Market *
                  </label>
                  <select
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="NGX">NGX (Nigeria)</option>
                    <option value="global">Global Markets</option>
                    <option value="crypto">Crypto</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Asset Type *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="equity">Equity / Stock</option>
                    <option value="mutual_fund">Mutual Fund</option>
                    <option value="treasury_bill">Treasury Bill</option>
                    <option value="crypto">Crypto Asset</option>
                    <option value="real_estate">Real Estate / REIT</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="NGN">NGN (₦)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Quantity (Shares / Units)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 1000 or 0.15"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Total Cost Basis *
                  </label>
                  <input
                    type="number"
                    required
                    step="any"
                    placeholder="Amount invested"
                    value={costBasis}
                    onChange={(e) => setCostBasis(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Current Value (or Current Price)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Leave empty to use cost basis"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Link to Strategy (Optional)
                </label>
                <select
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                  }}
                >
                  <option value="">None (Independent holding)</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'transparent',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingHolding}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: submittingHolding ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingHolding ? 'Saving...' : editingHolding ? 'Save Changes' : 'Add Holding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Price Update Modal */}
      {showPriceModal && priceUpdateTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--text-primary)' }}>
                  Update Price: {priceUpdateTarget.symbol_or_name}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Market: {priceUpdateTarget.market} | Qty: {priceUpdateTarget.quantity?.toLocaleString() || '1'}
                </p>
              </div>
              <button
                onClick={() => setShowPriceModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPriceUpdate}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Unit Price ({priceUpdateTarget.currency}) *
                </label>
                <input
                  type="number"
                  required
                  step="any"
                  placeholder="e.g. 720.00"
                  value={updatePrice}
                  onChange={(e) => setUpdatePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Effective Date
                  </label>
                  <input
                    type="date"
                    required
                    value={updateDate}
                    onChange={(e) => setUpdateDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Source
                  </label>
                  <select
                    value={updateSource}
                    onChange={(e) => setUpdateSource(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="manual">Manual Journal</option>
                    <option value="api">Live API Sync</option>
                  </select>
                </div>
              </div>

              {/* Live Preview Calculation */}
              {updatePrice !== '' && (
                <div
                  style={{
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    border: '1px solid rgba(37, 99, 235, 0.15)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    marginBottom: '20px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Projected New Valuation:
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {priceUpdateTarget.currency}
                    {priceUpdateTarget.quantity
                      ? (priceUpdateTarget.quantity * Number(updatePrice)).toLocaleString()
                      : Number(updatePrice).toLocaleString()}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPriceModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'transparent',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPrice}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: submittingPrice ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingPrice ? 'Logging Update...' : 'Log Price Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
