import React, { useEffect, useState } from 'react';
import { KpiCard } from '../components/KpiCard';
import type { Liability } from '../../../worker/types';

export const LiabilitiesScreen: React.FC = () => {
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [totalLiabilities, setTotalLiabilities] = useState(0);
  const [totalMonthlyMin, setTotalMonthlyMin] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState('loan');
  const [principal, setPrincipal] = useState<number | ''>('');
  const [currentBalance, setCurrentBalance] = useState<number | ''>('');
  const [interestRate, setInterestRate] = useState<number | ''>('');
  const [minimumPayment, setMinimumPayment] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [lender, setLender] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLiabilities();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchLiabilities = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/liabilities', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        setLiabilities(json.liabilities || []);
        setTotalLiabilities(json.total_liabilities || 0);
        setTotalMonthlyMin(json.total_monthly_minimum || 0);
      }
    } catch (err) {
      console.error('Failed to load liabilities:', err);
      showToast('error', 'Network error loading liabilities');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setName('');
    setType('loan');
    setPrincipal('');
    setCurrentBalance('');
    setInterestRate('');
    setMinimumPayment('');
    setDueDate('');
    setLender('');
    setEditingLiability(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (liab: Liability) => {
    setEditingLiability(liab);
    setName(liab.name);
    setType(liab.type);
    setPrincipal(liab.principal);
    setCurrentBalance(liab.current_balance);
    setInterestRate(liab.interest_rate !== null ? liab.interest_rate : '');
    setMinimumPayment(liab.minimum_payment !== null ? liab.minimum_payment : '');
    setDueDate(liab.due_date || '');
    setLender(liab.lender || '');
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', 'Name is required');
      return;
    }
    if (!principal || Number(principal) <= 0) {
      showToast('error', 'Principal must be greater than zero');
      return;
    }
    if (currentBalance === '' || Number(currentBalance) < 0) {
      showToast('error', 'Current balance cannot be negative');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        type,
        principal: Number(principal),
        current_balance: Number(currentBalance),
        interest_rate: interestRate !== '' ? Number(interestRate) : null,
        minimum_payment: minimumPayment !== '' ? Number(minimumPayment) : null,
        due_date: dueDate || null,
        lender: lender.trim() || null,
      };

      const url = editingLiability ? `/api/liabilities/${editingLiability.id}` : '/api/liabilities';
      const method = editingLiability ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('success', editingLiability ? 'Liability updated' : 'Liability added');
        setShowAddModal(false);
        fetchLiabilities();
      } else {
        const errJson = await res.json();
        showToast('error', errJson.error || 'Failed to save liability');
      }
    } catch {
      showToast('error', 'Network error saving liability');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this debt record?')) return;

    try {
      const res = await fetch(`/api/liabilities/${id}`, {
        method: 'DELETE',
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        showToast('success', 'Liability removed');
        fetchLiabilities();
      } else {
        showToast('error', 'Failed to delete liability');
      }
    } catch {
      showToast('error', 'Network error deleting liability');
    }
  };

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="screen-title">Liabilities & Debt</h2>
          <p className="screen-subtitle">Track loan balances, repayment terms, and debt service obligations</p>
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
          <span>+</span> Add Liability
        </button>
      </div>

      {feedback && (
        <div className={`feedback-toast ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {/* Summary KPI Row */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <KpiCard
          label="Total Outstanding Debt"
          value={formatNgn(totalLiabilities)}
          icon="!"
          iconBg="rgba(220, 38, 38, 0.08)"
          iconColor="var(--color-negative)"
          subtext="Directly deducted from net worth"
        />

        <KpiCard
          label="Monthly Debt Service"
          value={formatNgn(totalMonthlyMin)}
          icon="📅"
          iconBg="rgba(245, 158, 11, 0.08)"
          iconColor="#B45309"
          subtext="Sum of minimum monthly obligations"
        />

        <KpiCard
          label="Active Facilities"
          value={`${liabilities.length}`}
          icon="🏦"
          iconBg="rgba(37, 99, 235, 0.08)"
          iconColor="var(--color-primary)"
          subtext="Loans, cards, and personal obligations"
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
          Loading liabilities...
        </div>
      ) : liabilities.length === 0 ? (
        <div className="budget-variance-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛡️</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Zero Debt Recorded</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', maxWidth: '420px', margin: '0 auto 20px' }}>
            You have no outstanding loans or liabilities logged. If you have credit facilities or personal loans, add them here to keep your net worth honest.
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
            Add Liability
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {liabilities.map((l) => {
            const paidDownPct = l.principal > 0 ? Math.max(0, Math.min(100, Math.round(((l.principal - l.current_balance) / l.principal) * 100))) : 0;
            return (
              <div key={l.id} className="budget-variance-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {l.name}
                      </h3>
                      {l.lender && (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          Lender: {l.lender}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: 'var(--bg-subtle)',
                        color: 'var(--color-text-secondary)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      {l.type}
                    </span>
                  </div>

                  {/* Balance details */}
                  <div style={{ margin: '14px 0 10px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      Current Balance
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-negative)' }} className="tabular-nums">
                      {formatNgn(l.current_balance)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      Original Principal: {formatNgn(l.principal)} ({paidDownPct}% paid down)
                    </div>
                  </div>

                  {/* Terms */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', margin: '14px 0' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Interest Rate</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {l.interest_rate !== null ? `${l.interest_rate}% p.a.` : '0%'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Min Payment</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {l.minimum_payment ? formatNgn(l.minimum_payment) : 'Flexible'}
                      </div>
                    </div>
                  </div>

                  {l.due_date && (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
                      📅 Next payment due: <strong>{l.due_date}</strong>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <button
                    onClick={() => handleOpenEdit(l)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    Update Balance
                  </button>
                  <button
                    onClick={() => handleDelete(l.id)}
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
            );
          })}
        </div>
      )}

      {/* Modal for Add / Edit Liability */}
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
              maxWidth: '480px',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-hover)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>
                {editingLiability ? 'Update Liability' : 'Add Liability'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ fontSize: '18px', color: 'var(--color-text-muted)', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Liability Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vehicle Financing Loan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="budget-input"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="budget-input"
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  >
                    <option value="loan">Loan</option>
                    <option value="credit facility">Credit Facility</option>
                    <option value="personal debt">Personal Debt</option>
                    <option value="mortgage">Mortgage</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Lender / Creditor
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Zenith Bank"
                    value={lender}
                    onChange={(e) => setLender(e.target.value)}
                    className="budget-input"
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Principal (₦)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5000000"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value === '' ? '' : Number(e.target.value))}
                    className="budget-input"
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                    min={1}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Current Balance (₦)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 3500000"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value === '' ? '' : Number(e.target.value))}
                    className="budget-input"
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                    min={0}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Interest Rate (% p.a.)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 18.5"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value === '' ? '' : Number(e.target.value))}
                    className="budget-input"
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Min Monthly Payment (₦)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 120000"
                    value={minimumPayment}
                    onChange={(e) => setMinimumPayment(e.target.value === '' ? '' : Number(e.target.value))}
                    className="budget-input"
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Next Payment Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
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
                  {submitting ? 'Saving...' : editingLiability ? 'Update Liability' : 'Add Liability'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
