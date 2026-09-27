import React, { useState } from 'react';
import type { AllocationBucket } from '../../../worker/types';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  buckets: AllocationBucket[];
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  buckets,
}) => {
  const [fromBucketId, setFromBucketId] = useState<string>('');
  const [toBucketId, setToBucketId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const sourceBucket = buckets.find((b) => String(b.id) === fromBucketId);
  const targetBucket = buckets.find((b) => String(b.id) === toBucketId);

  const formatNgn = (val: number) => {
    return '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromBucketId || !toBucketId) {
      setError('Please select both source and destination buckets.');
      return;
    }
    if (fromBucketId === toBucketId) {
      setError('Source and destination buckets must be different.');
      return;
    }
    if (!amount || numAmount <= 0) {
      setError('Please enter a transfer amount greater than 0.');
      return;
    }
    if (!date) {
      setError('Please select a valid transfer date.');
      return;
    }

    if (sourceBucket && numAmount > sourceBucket.balance) {
      const confirmOverdraw = window.confirm(
        `Source bucket '${sourceBucket.name}' has balance of ${formatNgn(sourceBucket.balance)}. Transferring ${formatNgn(numAmount)} will result in a negative balance. Do you want to proceed?`
      );
      if (!confirmOverdraw) return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/buckets/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          from_bucket_id: Number(fromBucketId),
          to_bucket_id: Number(toBucketId),
          amount: numAmount,
          reason: reason.trim() || null,
          date,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(json.error || 'Failed to complete bucket transfer.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error executing transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border-color, #334155)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--color-primary, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '18px',
              }}
            >
              ⇄
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)' }}>
                Transfer Between Buckets
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Reallocate funds between your six financial steward buckets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #94a3b8)',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                color: '#f87171',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          {/* Source Bucket */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Source Bucket (Debit) *
            </label>
            <select
              required
              value={fromBucketId}
              onChange={(e) => setFromBucketId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-primary, #f8fafc)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">(Select Source Bucket)</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — Balance: {formatNgn(b.balance)}
                </option>
              ))}
            </select>
          </div>

          {/* Destination Bucket */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Destination Bucket (Credit) *
            </label>
            <select
              required
              value={toBucketId}
              onChange={(e) => setToBucketId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-primary, #f8fafc)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">(Select Destination Bucket)</option>
              {buckets
                .filter((b) => String(b.id) !== fromBucketId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — Current Balance: {formatNgn(b.balance)}
                  </option>
                ))}
            </select>
          </div>

          {/* Transfer Amount and Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Transfer Amount (₦) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10,000.00"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--color-text-primary, #f8fafc)',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--color-text-primary, #f8fafc)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Transfer Reason */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Reason / Memo
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Monthly emergency reserve sweep or project fund rebalance"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-primary, #f8fafc)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 18px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-secondary, #94a3b8)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 20px',
                backgroundColor: 'var(--color-primary, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Transferring...' : 'Execute Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
