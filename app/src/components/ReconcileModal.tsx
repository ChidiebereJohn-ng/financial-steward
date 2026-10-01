import React, { useEffect, useState } from 'react';
import type { Account, ReconciliationResult } from '../../../worker/types';

interface ReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReconciled?: () => void;
  initialAccountId?: number;
}

export const ReconcileModal: React.FC<ReconcileModalProps> = ({
  isOpen,
  onClose,
  onReconciled,
  initialAccountId,
}) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | ''>(initialAccountId || '');
  const [actualBalance, setActualBalance] = useState<number | ''>('');
  const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('checking');
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      setResult(null);
      setErrorMessage(null);
      if (initialAccountId) {
        setSelectedAccountId(initialAccountId);
      }
    }
  }, [isOpen, initialAccountId]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts', {
        headers: { 'x-dev-bypass': 'true' },
      });
      if (res.ok) {
        const json = await res.json();
        const accs = json.accounts || [];
        setAccounts(accs);
        if (!selectedAccountId && accs.length > 0) {
          setSelectedAccountId(accs[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) {
      setErrorMessage('Account name is required');
      return;
    }
    try {
      setCreatingAccount(true);
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
        body: JSON.stringify({ name: newAccountName.trim(), type: newAccountType, currency: 'NGN' }),
      });
      if (res.ok) {
        const json = await res.json();
        const created = json.account;
        setNewAccountName('');
        setShowAddAccount(false);
        await fetchAccounts();
        if (created?.id) setSelectedAccountId(created.id);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to create account');
      }
    } catch {
      setErrorMessage('Network error creating account');
    } finally {
      setCreatingAccount(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setErrorMessage('Please select an account');
      return;
    }
    if (actualBalance === '') {
      setErrorMessage('Please enter the statement actual balance');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const res = await fetch(`/api/accounts/${selectedAccountId}/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          actual_balance: Number(actualBalance),
          date: statementDate,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setResult(json.data);
        if (onReconciled) {
          onReconciled();
        }
      } else {
        const errJson = await res.json();
        setErrorMessage(errJson.error || 'Reconciliation failed');
      }
    } catch (err) {
      setErrorMessage('Network error during reconciliation');
    } finally {
      setSubmitting(false);
    }
  };

  const formatNgn = (amt: number) => {
    return '₦' + amt.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
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
        zIndex: 1100,
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
          boxShadow: 'var(--shadow-hover)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Account Reconciliation</h3>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Verify ledger records against your bank or wallet statement
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: '18px', color: 'var(--color-text-muted)', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="feedback-toast error" style={{ marginBottom: '16px' }}>
            {errorMessage}
          </div>
        )}

        {result ? (
          <div>
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px',
                backgroundColor: result.is_reconciled ? 'rgba(22, 163, 74, 0.08)' : 'rgba(245, 158, 11, 0.1)',
                border: `1px solid ${result.is_reconciled ? '#86efac' : '#fde68a'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>{result.is_reconciled ? '✅' : '⚠️'}</span>
                <strong style={{ color: result.is_reconciled ? 'var(--color-positive)' : '#b45309', fontSize: '14px' }}>
                  {result.is_reconciled ? 'Reconciliation Matched (₦0.00 Variance)' : 'Variance Detected! Flagged for Review'}
                </strong>
              </div>

              <p style={{ fontSize: '12px', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                {result.is_reconciled
                  ? `All transactions for ${result.account_name} perfectly match the statement balance as of ${result.reconciled_date}.`
                  : `There is a difference of ${formatNgn(Math.abs(result.variance))} between your statement and transaction history. Please inspect unlogged bank charges, omitted transactions, or date discrepancies.`}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius-sm)', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Statement Actual</span>
                <div style={{ fontSize: '16px', fontWeight: 700 }} className="tabular-nums">
                  {formatNgn(result.actual_balance)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Ledger Computed</span>
                <div style={{ fontSize: '16px', fontWeight: 700 }} className="tabular-nums">
                  {formatNgn(result.computed_balance)}
                </div>
              </div>
              <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Variance Flag</span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: result.is_reconciled ? 'var(--color-positive)' : 'var(--color-negative)',
                  }}
                  className="tabular-nums"
                >
                  {result.variance >= 0 ? '+' : ''}{formatNgn(result.variance)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setResult(null)}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Reconcile Another
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 18px',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Account to Reconcile
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                className="budget-input"
                style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.institution || a.type}) - {a.currency}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddAccount(!showAddAccount)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {showAddAccount ? 'Cancel' : '+ Add New Bank Account'}
                </button>
              </div>

              {showAddAccount && (
                <div style={{ marginTop: '8px', padding: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="e.g. Zenith Bank"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                  />
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value)}
                    style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="cash">Cash</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    disabled={creatingAccount}
                    style={{ padding: '6px 12px', backgroundColor: 'var(--color-primary)', color: '#ffffff', borderRadius: '4px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {creatingAccount ? 'Saving...' : 'Add'}
                  </button>
                </div>
              )}

              {selectedAccount?.last_reconciled_date && (
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  Last reconciled: {selectedAccount.last_reconciled_date} ({formatNgn(selectedAccount.last_reconciled_balance || 0)})
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Actual Statement Balance (₦)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 975000.00"
                value={actualBalance}
                onChange={(e) => setActualBalance(e.target.value === '' ? '' : Number(e.target.value))}
                className="budget-input"
                style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                The official closing balance shown on your bank/wallet statement.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Statement Date
              </label>
              <input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="budget-input"
                style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={onClose}
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
                {submitting ? 'Calculating...' : 'Reconcile Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
