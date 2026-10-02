import React, { useEffect, useState } from 'react';
import { ChartCard } from '../components/ChartCard';
import { KpiCard } from '../components/KpiCard';
import { BucketBadge } from '../components/BucketBadge';
import { ReconcileModal } from '../components/ReconcileModal';
import { ImportModal } from '../components/ImportModal';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { TransferModal } from '../components/TransferModal';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import type { LedgerDashboardData } from '../../../worker/types';

export const LedgerDashboard: React.FC = () => {
  const [data, setData] = useState<LedgerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Timeframe and filtering state
  const [timeframe, setTimeframe] = useState<'all' | '30d'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showAllTx, setShowAllTx] = useState(false);

  useEffect(() => {
    fetchLedgerData(true);
  }, []);

  const fetchLedgerData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
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
      if (isInitial) setLoading(false);
    }
  };

  const handleConfirmCommitment = async (id: number) => {
    try {
      setConfirmingId(id);
      const res = await fetch(`/api/recurring/${id}/confirm`, {
        method: 'POST',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Commitment recorded in ledger and due date rolled forward!' });
        setTimeout(() => setFeedback(null), 4000);
        fetchLedgerData();
      } else {
        const errJson = await res.json();
        setFeedback({ type: 'error', text: errJson.error || 'Failed to confirm commitment' });
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error confirming commitment' });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setConfirmingId(null);
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

  // Timeframe dynamic values
  const hasAllTime = Boolean(data.all_time_totals);
  const currentInflow = timeframe === 'all' && data.all_time_totals ? data.all_time_totals.total_inflow : totalInflows30;
  const currentOutflow = timeframe === 'all' && data.all_time_totals ? data.all_time_totals.total_outflow : totalOutflows30;
  const currentNetDelta = timeframe === 'all' && data.all_time_totals ? data.all_time_totals.net_delta : netDelta30;

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

  // Filter & sort transactions accurately by canonical YYYY-MM-DD
  const filteredTransactions = data.recent_transactions
    .filter((tx) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (tx.note && tx.note.toLowerCase().includes(q)) ||
        (tx.purpose_label && tx.purpose_label.toLowerCase().includes(q)) ||
        (tx.category_name && tx.category_name.toLowerCase().includes(q)) ||
        (tx.bucket_name && tx.bucket_name.toLowerCase().includes(q)) ||
        (tx.date && tx.date.includes(q)) ||
        String(tx.amount).includes(q)
      );
    })
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) {
        return sortOrder === 'desc' ? -dateCmp : dateCmp;
      }
      return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
    });

  const displayedTransactions = showAllTx ? filteredTransactions : filteredTransactions.slice(0, 15);

  return (
    <div>
      {/* Top Bar with Live Search & Date */}
      <div className="top-bar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search transactions, accounts, categories, or buckets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '0 4px',
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
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
          <p className="screen-subtitle">Real-time bucket allocations, cash flow analytics, and recent activity</p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
              cursor: 'pointer',
              border: 'none',
            }}
            onClick={() => setShowAddTxModal(true)}
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
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => setShowTransferModal(true)}
          >
            <span>⇄</span> Transfer
          </button>
          <button
            style={{
              padding: '9px 14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--color-primary)',
              color: 'var(--color-primary)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            onClick={() => setShowReconcileModal(true)}
          >
            <span>⚖️</span> Reconcile
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
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            onClick={() => setShowImportModal(true)}
          >
            <span>📥</span> Import CSV
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`feedback-toast ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {/* Timeframe Selector Pill Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Summary Timeframe:
          </span>
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '2px',
              gap: '2px',
            }}
          >
            <button
              onClick={() => setTimeframe('all')}
              style={{
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: timeframe === 'all' ? 'var(--color-primary)' : 'transparent',
                color: timeframe === 'all' ? '#ffffff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              All Time {hasAllTime && ' (Imported)'}
            </button>
            <button
              onClick={() => setTimeframe('30d')}
              style={{
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: timeframe === '30d' ? 'var(--color-primary)' : 'transparent',
                color: timeframe === '30d' ? '#ffffff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              Last 30 Days
            </button>
          </div>
        </div>
        {timeframe === 'all' && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
            Displaying cumulative figures across all imported WealthVault and live records
          </span>
        )}
      </div>

      {/* Top Stat Card Row */}
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
          label={timeframe === 'all' ? 'All-Time Total Inflow' : '30-Day Total Inflow'}
          value={formatNgn(currentInflow)}
          icon="↓"
          iconBg="rgba(22, 163, 74, 0.08)"
          iconColor="var(--color-positive)"
          trend={{
            value: timeframe === 'all' ? 'Cumulative Inflow' : 'Inflows',
            direction: 'up',
          }}
        />

        <KpiCard
          label={timeframe === 'all' ? 'All-Time Total Outflow' : '30-Day Total Outflow'}
          value={formatNgn(currentOutflow)}
          icon="↑"
          iconBg="rgba(220, 38, 38, 0.08)"
          iconColor="var(--color-negative)"
          trend={{
            value: timeframe === 'all' ? 'Cumulative Outflow' : 'Outflows',
            direction: 'down',
          }}
        />

        <KpiCard
          label={timeframe === 'all' ? 'All-Time Net Delta' : '30-Day Net Delta'}
          value={`${currentNetDelta >= 0 ? '+' : ''}${formatNgn(currentNetDelta)}`}
          icon="Δ"
          iconBg={currentNetDelta >= 0 ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)'}
          iconColor={currentNetDelta >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
          trend={{
            value: currentNetDelta >= 0 ? 'Surplus' : 'Deficit',
            direction: currentNetDelta >= 0 ? 'up' : 'down',
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

      {/* Upcoming Commitments */}
      {data.upcoming_commitments && data.upcoming_commitments.length > 0 && (
        <div className="budget-variance-card" style={{ marginBottom: '24px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏰</span> Upcoming Commitments
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Recurring payments due within the next 3 days
              </p>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#b45309', backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '3px 8px', borderRadius: '4px' }}>
              {data.upcoming_commitments.length} Due Soon
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.upcoming_commitments.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                    {item.note || item.category_name || 'Commitment'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {item.frequency} • Due {item.next_due_date} ({item.days_until_due <= 0 ? 'Due today/overdue' : `in ${item.days_until_due} days`})
                    {item.account_name && ` • ${item.account_name}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700 }} className="tabular-nums">
                    {formatNgn(item.amount)}
                  </div>
                  <button
                    onClick={() => handleConfirmCommitment(item.id)}
                    disabled={confirmingId === item.id}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--color-primary)',
                      color: '#ffffff',
                      borderRadius: 'var(--radius-sm)',
                      opacity: confirmingId === item.id ? 0.7 : 1,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {confirmingId === item.id ? 'Confirming...' : 'Confirm Payment'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Inflow / Outflow Bar Chart */}
      <div style={{ marginBottom: '24px' }}>
        <ChartCard
          title="Daily Inflow & Outflow Activity"
          subtitle={dailySeries.length > 0 ? `Activity across ${dailySeries.length} recorded dates` : 'Cash movements over the past 30 days'}
          config={inflowOutflowChartConfig}
        />
      </div>

      {/* Transactions Feed with Live Search, Sorting, and Pagination */}
      <div className="transaction-card">
        <div className="transaction-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Transaction Activity
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Showing {displayedTransactions.length} of {filteredTransactions.length} records
              {searchQuery && ` (filtered by "${searchQuery}")`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Date Sorting Toggle Button */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              style={{
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                borderRadius: 'var(--radius-sm, 6px)',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text-secondary, #94a3b8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Toggle chronological sorting"
            >
              <span>Date:</span>
              <strong style={{ color: 'var(--color-text-primary, #f8fafc)' }}>
                {sortOrder === 'desc' ? 'Newest First ↓' : 'Oldest First ↑'}
              </strong>
            </button>

            {filteredTransactions.length > 15 && (
              <span
                onClick={() => setShowAllTx(!showAllTx)}
                style={{
                  fontSize: '13px',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {showAllTx ? 'Show Recent Only ↑' : `View Full History (${filteredTransactions.length}) →`}
              </span>
            )}
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            {searchQuery
              ? `No transactions match "${searchQuery}".`
              : 'No transactions recorded yet. Click "+ Add Transaction" or "Import CSV" to begin.'}
          </div>
        ) : (
          <div className="transaction-list">
            {displayedTransactions.map((tx) => (
              <div
                key={tx.id}
                className="tx-row"
                onClick={() => setSelectedTxId(tx.id)}
                style={{ cursor: 'pointer' }}
                title="Click to view details, audit trail, or reverse"
              >
                <div className="tx-left">
                  <div className={`tx-circle ${tx.direction}`}>
                    {tx.direction === 'inflow' ? '↓' : '↑'}
                  </div>
                  <div className="tx-details">
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>
                        {tx.note ||
                          (tx.direction === 'inflow'
                            ? (tx as any).income_source_name
                              ? `Inflow: ${(tx as any).income_source_name}`
                              : 'Income Allocation'
                            : tx.purpose_label || tx.category_name || 'Expense Debit')}
                      </span>
                      {tx.note?.includes('[DELETED]') && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: 'var(--color-negative)',
                            fontWeight: 700,
                          }}
                        >
                          REVERSED
                        </span>
                      )}
                    </h4>
                    <p>
                      {tx.direction === 'inflow'
                        ? `${(tx as any).income_source_name ? `Source: ${(tx as any).income_source_name} • ` : 'Inflow • '}${tx.date}`
                        : `${tx.category_name ? `${tx.category_name} • ` : ''}${tx.date}`}
                      {tx.purpose_label && !tx.note?.includes(tx.purpose_label) && ` • Purpose: ${tx.purpose_label}`}
                      {tx.account_name && ` • ${tx.account_name}`}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {tx.bucket_name && (
                    <BucketBadge bucketKey={tx.bucket_name.toLowerCase()} name={tx.bucket_name} />
                  )}
                  <div className={`tx-amount ${tx.direction}`}>
                    {tx.direction === 'inflow' ? '+' : '-'}{formatNgn(tx.amount)}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTxId(tx.id);
                    }}
                    title="Inspect or Delete / Reverse transaction"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      opacity: 0.7,
                    }}
                  >
                    🗑️
                  </button>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction Detail & Reversal Modal */}
      <TransactionDetailModal
        isOpen={selectedTxId !== null}
        transactionId={selectedTxId}
        onClose={() => setSelectedTxId(null)}
        onSuccess={() => {
          fetchLedgerData();
          setFeedback({ type: 'success', text: 'Transaction successfully reversed and ledger updated!' });
          setTimeout(() => setFeedback(null), 4000);
        }}
      />

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isOpen={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        onSuccess={() => {
          fetchLedgerData();
          setFeedback({ type: 'success', text: 'Transaction recorded and ledger successfully updated!' });
          setTimeout(() => setFeedback(null), 4000);
        }}
        buckets={data.buckets}
      />

      {/* Transfer Modal */}
      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={() => {
          fetchLedgerData();
          setFeedback({ type: 'success', text: 'Bucket transfer executed successfully!' });
          setTimeout(() => setFeedback(null), 4000);
        }}
        buckets={data.buckets}
      />

      {/* Reconcile Modal */}
      <ReconcileModal
        isOpen={showReconcileModal}
        onClose={() => setShowReconcileModal(false)}
        onReconciled={() => {
          fetchLedgerData();
          setFeedback({ type: 'success', text: 'Account reconciliation logged.' });
          setTimeout(() => setFeedback(null), 4000);
        }}
      />

      {/* Import WealthVault CSV Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          fetchLedgerData();
          setFeedback({ type: 'success', text: 'WealthVault CSV successfully imported and reconciled!' });
          setTimeout(() => setFeedback(null), 4000);
        }}
      />
    </div>
  );
};
