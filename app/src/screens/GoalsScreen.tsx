import React, { useEffect, useState } from 'react';
import { BucketBadge } from '../components/BucketBadge';
import type { GoalWithProgress, AllocationBucket } from '../../../worker/types';

export const GoalsScreen: React.FC = () => {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [buckets, setBuckets] = useState<AllocationBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithProgress | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState<number | ''>('');
  const [targetDate, setTargetDate] = useState('');
  const [linkedBucketId, setLinkedBucketId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchGoals();
    fetchBuckets();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/goals', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setGoals(json.goals || []);
      }
    } catch (err) {
      console.error('Failed to load goals:', err);
      showToast('error', 'Network error loading goals');
    } finally {
      setLoading(false);
    }
  };

  const fetchBuckets = async () => {
    try {
      const res = await fetch('/api/buckets', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setBuckets(json.buckets || []);
      }
    } catch (err) {
      console.error('Failed to load buckets:', err);
    }
  };

  const handleOpenAdd = () => {
    setName('');
    setTargetAmount('');
    setTargetDate('');
    setLinkedBucketId(buckets.find((b) => b.key === 'savings')?.id || '');
    setEditingGoal(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (goal: GoalWithProgress) => {
    setEditingGoal(goal);
    setName(goal.name);
    setTargetAmount(goal.target_amount);
    setTargetDate(goal.target_date || '');
    setLinkedBucketId(goal.linked_bucket_id || '');
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', 'Goal name is required');
      return;
    }
    if (!targetAmount || Number(targetAmount) <= 0) {
      showToast('error', 'Target amount must be greater than zero');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        target_amount: Number(targetAmount),
        target_date: targetDate || null,
        linked_bucket_id: linkedBucketId ? Number(linkedBucketId) : null,
      };

      const url = editingGoal ? `/api/goals/${editingGoal.id}` : '/api/goals';
      const method = editingGoal ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('success', editingGoal ? 'Goal updated successfully' : 'Goal created successfully');
        setShowAddModal(false);
        fetchGoals();
      } else {
        const errJson = await res.json();
        showToast('error', errJson.error || 'Failed to save goal');
      }
    } catch (err) {
      showToast('error', 'Network error saving goal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'DELETE',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        showToast('success', 'Goal deleted');
        fetchGoals();
      } else {
        showToast('error', 'Failed to delete goal');
      }
    } catch {
      showToast('error', 'Network error deleting goal');
    }
  };

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="screen-title">Financial Goals</h2>
          <p className="screen-subtitle">Milestones tied dynamically to your live allocation bucket balances</p>
        </div>

        <button
          onClick={handleOpenAdd}
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
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span>+</span> Add Goal
        </button>
      </div>

      {feedback && (
        <div className={`feedback-toast ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
          Loading your financial goals...
        </div>
      ) : goals.length === 0 ? (
        <div className="budget-variance-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎯</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>No Goals Created Yet</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', maxWidth: '420px', margin: '0 auto 20px' }}>
            Set milestone targets like an Emergency Fund, Project Capital, or Vehicle Upgrade. Link them to a bucket to track live progress automatically.
          </p>
          <button
            onClick={handleOpenAdd}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {goals.map((g) => (
            <div key={g.id} className="budget-variance-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {g.name}
                    </h3>
                    {g.target_date && (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Target: {g.target_date}
                      </span>
                    )}
                  </div>
                  {g.linked_bucket_key ? (
                    <BucketBadge bucketKey={g.linked_bucket_key} name={g.linked_bucket_name || g.linked_bucket_key} />
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', backgroundColor: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: '4px' }}>
                      Unlinked
                    </span>
                  )}
                </div>

                {/* Progress Visual */}
                <div style={{ margin: '16px 0 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }} className="tabular-nums">
                      {formatNgn(g.current_amount)}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                      of {formatNgn(g.target_amount)} ({g.progress_pct}%)
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, g.progress_pct))}%`,
                        backgroundColor: g.progress_pct >= 100 ? 'var(--color-positive)' : 'var(--color-primary)',
                        borderRadius: '999px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                  {g.progress_pct >= 100 ? (
                    <span style={{ color: 'var(--color-positive)', fontWeight: 600 }}>
                      🎉 Goal completed!
                    </span>
                  ) : (
                    <span>
                      <strong style={{ color: 'var(--color-text-primary)' }}>{formatNgn(g.remaining_amount)}</strong> left to reach target
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <button
                  onClick={() => handleOpenEdit(g)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(g.id)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--color-negative)',
                    backgroundColor: 'rgba(220, 38, 38, 0.08)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Add / Edit Goal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-card)',
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              boxShadow: 'var(--shadow-hover)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>
                {editingGoal ? 'Edit Goal' : 'Create Financial Goal'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ fontSize: '18px', color: 'var(--color-text-muted)', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Goal Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6-Month Emergency Buffer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="budget-input"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Target Amount (₦)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1000000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="budget-input"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  min={1}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Linked Allocation Bucket
                </label>
                <select
                  value={linkedBucketId}
                  onChange={(e) => setLinkedBucketId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="budget-input"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                >
                  <option value="">No linked bucket (manual track)</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.key})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  Progress is calculated dynamically from this bucket's live balance.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Target Date (Optional)
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="budget-input"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Saving...' : editingGoal ? 'Update Goal' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
