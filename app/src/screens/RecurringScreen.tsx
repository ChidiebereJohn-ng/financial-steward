import React, { useEffect, useState } from 'react';
import type { RecurringTransactionItem, Category, AllocationBucket, Account } from '../../../worker/types';

export const RecurringScreen: React.FC = () => {
  const [items, setItems] = useState<RecurringTransactionItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [buckets, setBuckets] = useState<AllocationBucket[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [direction, setDirection] = useState<'outflow' | 'inflow'>('outflow');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [nextDueDate, setNextDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [categoryId, setCategoryId] = useState<string>('');
  const [bucketId, setBucketId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [recRes, catRes, buckRes, accRes] = await Promise.all([
        fetch('/api/recurring', { headers: { 'x-dev-bypass': 'true' } }),
        fetch('/api/categories', { headers: { 'x-dev-bypass': 'true' } }),
        fetch('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }),
        fetch('/api/accounts', { headers: { 'x-dev-bypass': 'true' } }),
      ]);

      if (recRes.ok) {
        const json = await recRes.json();
        setItems(json.recurring || []);
      }
      if (catRes.ok) {
        const json = await catRes.json();
        setCategories(json.categories || []);
      }
      if (buckRes.ok) {
        const json = await buckRes.json();
        setBuckets(json.data || json.buckets || []);
      }
      if (accRes.ok) {
        const json = await accRes.json();
        setAccounts(json.accounts || []);
      }
    } catch (err) {
      console.error('Failed to load recurring data:', err);
      showToast('error', 'Network error loading recurring commitments');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      setConfirmingId(id);
      const res = await fetch(`/api/recurring/${id}/confirm`, {
        method: 'POST',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        showToast('success', 'Commitment recorded in ledger and due date rolled forward!');
        fetchData();
      } else {
        const errJson = await res.json();
        showToast('error', errJson.error || 'Failed to confirm commitment');
      }
    } catch {
      showToast('error', 'Network error confirming commitment');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this recurring commitment?')) return;
    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method: 'DELETE',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        showToast('success', 'Recurring commitment deleted');
        fetchData();
      } else {
        showToast('error', 'Failed to delete commitment');
      }
    } catch {
      showToast('error', 'Network error deleting commitment');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      showToast('error', 'Please enter a valid amount');
      return;
    }
    if (!nextDueDate) {
      showToast('error', 'Next due date is required');
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        amount: Number(amount),
        direction,
        frequency,
        next_due_date: nextDueDate,
        note: note.trim() || null,
        category_id: categoryId ? Number(categoryId) : null,
        bucket_id: bucketId ? Number(bucketId) : null,
        account_id: accountId ? Number(accountId) : null,
        active: 1,
      };

      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('success', 'Recurring commitment created successfully!');
        setShowAddModal(false);
        setNote('');
        setAmount('');
        fetchData();
      } else {
        const errJson = await res.json();
        showToast('error', errJson.error || 'Failed to create commitment');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatNgn = (val: number) => {
    return '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const activeItems = items.filter((i) => i.active === 1);
  const totalMonthlyCommitment = activeItems.reduce((sum, i) => {
    if (i.direction === 'outflow') {
      const multiplier = i.frequency === 'weekly' ? 4.33 : i.frequency === 'quarterly' ? 0.33 : i.frequency === 'yearly' ? 0.083 : 1;
      return sum + i.amount * multiplier;
    }
    return sum;
  }, 0);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
      {feedback && (
        <div className={`feedback-toast ${feedback.type}`} style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}>
          {feedback.text}
        </div>
      )}

      {/* Screen Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
            Recurring Commitments
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Manage recurring bills, tithes, subscriptions, and auto-advancing obligations
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '9px 18px',
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
        >
          <span>+</span> Add Recurring Commitment
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Commitments</span>
          <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '6px', color: 'var(--color-text-primary)' }}>
            {activeItems.length} Subscriptions & Bills
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Est. Monthly Burn</span>
          <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '6px', color: 'var(--color-negative)' }} className="tabular-nums">
            {formatNgn(totalMonthlyCommitment)} / month
          </div>
        </div>
      </div>

      {/* Commitments Table Card */}
      <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading recurring commitments...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: '15px' }}>No recurring commitments recorded yet.</p>
            <button
              onClick={() => setShowAddModal(true)}
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
              Add Your First Commitment
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Commitment</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Frequency</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Next Due Date</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                      <div>{item.note || item.category_name || 'Commitment'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {item.category_name && `${item.category_name} • `}
                        {item.account_name || 'Default Account'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>
                      {item.frequency}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }} className="tabular-nums">
                      <span style={{ color: item.direction === 'inflow' ? 'var(--color-positive)' : 'var(--color-text-primary)' }}>
                        {item.direction === 'inflow' ? '+' : '-'}{formatNgn(item.amount)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div>{item.next_due_date}</div>
                      <div style={{ fontSize: '11px', color: item.days_until_due <= 3 ? '#b45309' : 'var(--color-text-secondary)', fontWeight: item.days_until_due <= 3 ? 600 : 400 }}>
                        {item.days_until_due <= 0 ? 'Due today / overdue' : `in ${item.days_until_due} days`}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: item.active === 1 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                          color: item.active === 1 ? 'var(--color-positive)' : 'var(--color-text-secondary)',
                        }}
                      >
                        {item.active === 1 ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => handleConfirm(item.id)}
                          disabled={confirmingId === item.id}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: 'var(--color-primary)',
                            color: '#ffffff',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {confirmingId === item.id ? 'Recording...' : 'Pay / Advance'}
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(220, 38, 38, 0.08)',
                            color: 'var(--color-negative)',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) setShowAddModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Add Recurring Commitment</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Title / Note *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Internet Subscription or Church Tithe"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Amount (₦) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="15000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Frequency *</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}
                  >
                    <option value="">(None / General)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Next Due Date *</label>
                  <input
                    type="date"
                    required
                    value={nextDueDate}
                    onChange={(e) => setNextDueDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 18px', borderRadius: '6px', backgroundColor: 'var(--color-primary)', color: '#ffffff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                >
                  {submitting ? 'Saving...' : 'Save Commitment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
