import React, { useEffect, useState } from 'react';
import type { DigestItem } from '../../../worker/types';

export const DigestScreen: React.FC = () => {
  const [items, setItems] = useState<DigestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'tbills' | 'bonds' | 'mmf' | 'equities' | 'global'>('all');
  const [newTopic, setNewTopic] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchDigestItems();
  }, []);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchDigestItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/digest?limit=50', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        showFeedback('error', 'Failed to retrieve research digest');
      }
    } catch (err) {
      console.error('Error fetching digest:', err);
      showFeedback('error', 'Network error fetching digest items');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshBriefing = async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/digest/refresh', {
        method: 'POST',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        showFeedback('success', data.message || 'Generated updated paper-asset research briefings!');
      } else {
        const errJson = await res.json().catch(() => ({}));
        showFeedback('error', errJson.error || 'Failed to refresh research digest');
      }
    } catch (err) {
      showFeedback('error', 'Network error refreshing research briefings');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleReadStatus = async (item: DigestItem) => {
    const nextStatus = item.read_status === 1 ? 0 : 1;
    try {
      const res = await fetch(`/api/digest/${item.id}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({ read_status: nextStatus }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, read_status: data.item.read_status } : i))
        );
      } else {
        showFeedback('error', 'Failed to update read status');
      }
    } catch (err) {
      console.error('Error toggling read status:', err);
      showFeedback('error', 'Network error updating item');
    }
  };

  const handleAddDigest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim() || !newSummary.trim()) {
      showFeedback('error', 'Topic and summary are required');
      return;
    }

    try {
      setAdding(true);
      const res = await fetch('/api/digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          topic: newTopic.trim(),
          summary: newSummary.trim(),
          source_url: newSourceUrl.trim() || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create research item');
      }

      showFeedback('success', 'New research insight added to digest');
      setShowAddModal(false);
      setNewTopic('');
      setNewSummary('');
      setNewSourceUrl('');
      fetchDigestItems();
    } catch (err: any) {
      showFeedback('error', err.message || 'Error saving item');
    } finally {
      setAdding(false);
    }
  };

  const unreadCount = items.filter((i) => i.read_status === 0).length;

  const filteredItems = items.filter((item) => {
    if (categoryFilter === 'all') return true;
    const text = (item.topic + ' ' + item.summary).toLowerCase();
    if (categoryFilter === 'tbills') {
      return text.includes('treasury') || text.includes('t-bill') || text.includes('ntb') || text.includes('cbn');
    }
    if (categoryFilter === 'bonds') {
      return text.includes('bond') || text.includes('fgn') || text.includes('dmo') || text.includes('coupon');
    }
    if (categoryFilter === 'mmf') {
      return text.includes('money market') || text.includes('commercial paper') || text.includes('mmf') || text.includes('liquidity');
    }
    if (categoryFilter === 'equities') {
      return text.includes('equities') || text.includes('dividend') || text.includes('ngx') || text.includes('stock') || text.includes('bank');
    }
    if (categoryFilter === 'global') {
      return text.includes('dollar') || text.includes('usd') || text.includes('s&p') || text.includes('eurobond') || text.includes('etf');
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              Curated Research Digest
            </h2>
            {unreadCount > 0 && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                }}
              >
                {unreadCount} unread
              </span>
            )}
          </div>
          <p style={{ margin: '6px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
            Actionable paper-asset intelligence, sovereign fixed-income yields, and macro compounding briefings.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefreshBriefing}
            disabled={refreshing}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: refreshing ? 0.7 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            <span>{refreshing ? '⏳' : '🔄'}</span>
            {refreshing ? 'Refreshing Briefings...' : 'Refresh Research'}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Intel Note
          </button>
        </div>
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

      {/* Strategic Guide Card: How Paper Assets Work in Financial Steward */}
      {showGuide && (
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '20px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📜</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#1E293B' }}>
                How to Use Research Digest for Paper Asset Investing
              </h3>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 6px',
              }}
              title="Dismiss guide"
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: '0 0 14px 0' }}>
            <strong>Paper assets</strong> are intangible contractual claims on cash flows (Treasury Bills, FGN Savings Bonds, Money Market Funds, Commercial Papers, NGX Dividend Equities, Dollar Index ETFs). They offer zero property management friction, high liquidity, and mathematically predictable compounding.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
            <div style={{ backgroundColor: '#FFFFFF', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB', marginBottom: '4px' }}>
                1. Sovereign Hurdle Rate
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
                Always benchmark yields against 364-day CBN Treasury Bills (19-21%). Never risk capital on assets that yield less than the sovereign risk-free rate.
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#16A34A', marginBottom: '4px' }}>
                2. Operational Liquidity
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
                Keep your <strong>Expenses & Savings</strong> bucket reserves in SEC-regulated Money Market Funds (MMFs) for daily interest accrual with T+1 instant redemption.
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#8B5CF6', marginBottom: '4px' }}>
                3. Quarterly Cash Flows
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
                Deploy <strong>Investment bucket</strong> capital into FGN Savings Bonds (17-18% coupon paid quarterly) to generate tax-free distributions directly into your bank.
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#D97706', marginBottom: '4px' }}>
                4. Automated Weekly Briefs
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
                The Cloudflare Worker runs every Monday at 06:00 UTC to evaluate yield movements. Click <strong>Refresh Research</strong> anytime to trigger an immediate update.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
          Asset Focus:
        </span>
        {[
          { key: 'all', label: `All Briefings (${items.length})` },
          { key: 'tbills', label: 'Treasury Bills (NTBs)' },
          { key: 'bonds', label: 'FGN Bonds' },
          { key: 'mmf', label: 'Money Market & CPs' },
          { key: 'equities', label: 'NGX Equities' },
          { key: 'global', label: 'Dollar Assets' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategoryFilter(tab.key as any)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              border: categoryFilter === tab.key ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
              backgroundColor: categoryFilter === tab.key ? 'var(--color-primary)' : 'var(--bg-card)',
              color: categoryFilter === tab.key ? '#ffffff' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed List */}
      {loading ? (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-card)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Loading financial intelligence digest...
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-card)',
            color: 'var(--color-text-secondary)',
          }}
        >
          No briefings match this filter. Click "Refresh Research" or select "All Briefings" to view current intelligence.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredItems.map((item) => {
            const isUnread = item.read_status === 0;
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-card)',
                  padding: '20px 24px',
                  boxShadow: 'var(--shadow-card)',
                  border: `1px solid ${isUnread ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  borderLeft: isUnread ? '4px solid var(--color-primary)' : '1px solid var(--border-color)',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: isUnread ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-page)',
                          color: isUnread ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        }}
                      >
                        {isUnread ? 'Unread Brief' : 'Archived'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {item.created_at ? item.created_at.split(' ')[0] : 'Recent'}
                      </span>
                    </div>

                    <h3
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        margin: '0 0 10px 0',
                        color: 'var(--color-text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      {item.topic}
                    </h3>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        lineHeight: 1.6,
                        color: 'var(--color-text-secondary)',
                        display: isExpanded ? 'block' : '-webkit-box',
                        WebkitLineClamp: isExpanded ? 'unset' : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.summary}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => toggleReadStatus(item)}
                      title={isUnread ? 'Mark as read' : 'Mark as unread'}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        fontWeight: 500,
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-page)',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isUnread ? 'Mark Read' : 'Mark Unread'}
                    </button>

                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 500,
                        }}
                      >
                        Source
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                {/* Expansion Toggle */}
                {item.summary.length > 120 && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 0 0 0',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {isExpanded ? 'Show Less ▲' : 'Read Full Briefing ▼'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Digest Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-card)',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
              Add Research Intel Item
            </h3>

            <form onSubmit={handleAddDigest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Topic / Headline
                </label>
                <input
                  type="text"
                  placeholder="e.g. CBN Treasury Bill Auction Yields"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-page)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Summary / Takeaway
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide concise key metrics, interest rates, or investment implications..."
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-page)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Source URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-page)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    cursor: adding ? 'not-allowed' : 'pointer',
                    opacity: adding ? 0.7 : 1,
                  }}
                >
                  {adding ? 'Saving...' : 'Save Intel Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
