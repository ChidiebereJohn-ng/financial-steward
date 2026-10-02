import React, { useState, useEffect } from 'react';
import { formatNgn } from '../utils/format';

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: number | null;
  onSuccess: () => void;
}

interface DetailData {
  transaction: {
    id: number;
    external_id?: string | null;
    date: string;
    direction: 'inflow' | 'outflow';
    subtype?: string | null;
    amount: number;
    currency: string;
    category_id?: number | null;
    category_name?: string | null;
    account_id?: number | null;
    account_name?: string | null;
    income_source_id?: number | null;
    income_source_name?: string | null;
    note?: string | null;
    purpose_label?: string | null;
    created_at?: string;
  };
  allocation_runs: Array<{
    id: number;
    bucket_id: number;
    bucket_name: string;
    bucket_key: string;
    allocated_amount: number;
    percentage: number;
    status: string;
  }>;
  ledger_entries: Array<{
    id: number;
    bucket_id: number;
    bucket_name: string;
    bucket_key: string;
    entry_type: string;
    amount: number;
    date: string;
    note?: string | null;
  }>;
  audit_log: Array<{
    id: number;
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  onClose,
  transactionId,
  onSuccess,
}) => {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !transactionId) {
      setData(null);
      setConfirmDelete(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/transactions/${transactionId}`, {
      headers: { 'x-dev-bypass': 'true' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load transaction details');
        return res.json();
      })
      .then((json) => {
        setData(json);
      })
      .catch((err) => {
        setError(err.message || 'Error fetching details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, transactionId]);

  if (!isOpen || !transactionId) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        method: 'DELETE',
        headers: { 'x-dev-bypass': 'true' },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to reverse transaction');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete transaction');
      setDeleting(false);
    }
  };

  const isDeleted = data?.transaction?.note?.includes('[DELETED]');

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
              Transaction #{transactionId}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Audit & Ledger Inspection
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading transaction details...
          </div>
        )}

        {error && (
          <div
            style={{
              margin: '16px 0',
              padding: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--color-negative)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-negative)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {data && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            {isDeleted && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid #f59e0b',
                  borderRadius: 'var(--radius-sm)',
                  color: '#f59e0b',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <div>
                  <strong>Reversed / Deleted:</strong> This transaction has been offset with negative ledger entries to maintain zero drift.
                </div>
              </div>
            )}

            {/* Core Transaction Card */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      backgroundColor:
                        data.transaction.direction === 'inflow'
                          ? 'rgba(34, 197, 94, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        data.transaction.direction === 'inflow'
                          ? 'var(--color-positive)'
                          : 'var(--color-negative)',
                      marginBottom: '6px',
                    }}
                  >
                    {data.transaction.direction === 'inflow' ? '↓ Inflow Allocation' : '↑ Expense Debit'}
                  </span>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                    {formatNgn(data.transaction.amount)}
                  </div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  <div><strong>Date:</strong> {data.transaction.date}</div>
                  {data.transaction.account_name && (
                    <div style={{ marginTop: '2px' }}>
                      <strong>Account:</strong> {data.transaction.account_name}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '12px', fontSize: '13px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <div><strong>Note:</strong> {data.transaction.note || 'None'}</div>
                {data.transaction.purpose_label && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Purpose:</strong> {data.transaction.purpose_label}
                  </div>
                )}
                {data.transaction.category_name && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Category:</strong> {data.transaction.category_name}
                  </div>
                )}
                {data.transaction.income_source_name && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Source:</strong> {data.transaction.income_source_name}
                  </div>
                )}
              </div>
            </div>

            {/* Inflow Waterfall Splits */}
            {data.transaction.direction === 'inflow' && data.allocation_runs.length > 0 && (
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                  6-Bucket Allocation Breakdown
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {data.allocation_runs.map((run) => (
                    <div
                      key={run.id}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{run.bucket_name}</span>
                        <span>{run.percentage}%</span>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
                        {formatNgn(run.allocated_amount)}
                      </div>
                      <div style={{ fontSize: '11px', marginTop: '2px', color: run.status === 'released' ? 'var(--color-positive)' : '#f59e0b' }}>
                        ● {run.status === 'released' ? 'Released' : 'Pending Release'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ledger Audit Entries */}
            {data.ledger_entries.length > 0 && (
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                  Immutable Ledger Entries ({data.ledger_entries.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.ledger_entries.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-subtle, #0f172a)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        borderLeft: `3px solid ${entry.amount >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}`,
                      }}
                    >
                      <div>
                        <strong>{entry.bucket_name}</strong>
                        <span style={{ color: 'var(--color-text-secondary)', marginLeft: '8px' }}>
                          ({entry.entry_type})
                        </span>
                        {entry.note && (
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                            {entry.note}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: entry.amount >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
                        }}
                      >
                        {entry.amount >= 0 ? '+' : ''}{formatNgn(entry.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit Log (Edits / Status changes) */}
            {data.audit_log.length > 0 && (
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                  Audit Trail History
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.audit_log.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-card)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Field <strong>{log.changed_field}</strong> changed from{' '}
                      <code>{log.old_value || 'null'}</code> to <code>{log.new_value || 'null'}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deletion & Reversal Section */}
            {!isDeleted && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  border: '1px dashed rgba(239, 68, 68, 0.4)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {!confirmDelete ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-negative)' }}>
                        Delete / Reverse This Transaction
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        Made a mistake? Reversing appends exact offsetting entries to return funds to your buckets.
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--color-negative)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-negative)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Reverse Transaction
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-negative)' }}>
                      Confirm Ledger Reversal
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '6px 0 12px 0' }}>
                      Are you sure you want to reverse this {data.transaction.direction}? All affected bucket balances will be automatically adjusted with an offsetting ledger entry to preserve immutable zero-drift integrity.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: 'var(--color-negative)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        {deleting ? 'Reversing...' : 'Yes, Reverse & Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
