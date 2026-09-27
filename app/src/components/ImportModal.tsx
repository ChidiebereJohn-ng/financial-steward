import React, { useState, useRef } from 'react';
import type { ImportProcessingResult, BucketReconciliationItem } from '../../../worker/types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv') || droppedFile.type === 'text/csv') {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please drop a valid RFC 4180 .csv file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file to import.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const csvContent = await file.text();
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          csv_content: csvContent,
          file_name: file.name,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setResult(json);
      } else {
        setError(json.error || 'Failed to process CSV import.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error during CSV ingestion.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
  };

  const formatNgn = (num: number) => {
    return '₦' + Math.abs(num).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const bucketColors: Record<string, string> = {
    tithe: 'var(--bucket-tithe, #8B5CF6)',
    kingdom: 'var(--bucket-kingdom, #EC4899)',
    savings: 'var(--bucket-savings, #3B82F6)',
    invest: 'var(--bucket-invest, #10B981)',
    charity: 'var(--bucket-charity, #F59E0B)',
    expense: 'var(--bucket-expense, #EF4444)',
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
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border-color, #334155)',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📥</span>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)' }}>
                Import WealthVault CSV
              </h3>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Ingest 19-column RFC 4180 export data from Firestore, reconstruct allocation lineage, and verify ledger reconciliation.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {!result ? (
            /* Upload State */
            <div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--color-primary, #3b82f6)' : 'var(--border-color, #475569)'}`,
                  backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-main, #0f172a)',
                  borderRadius: '12px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginBottom: '16px',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📄</div>
                {file ? (
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)', fontSize: '15px' }}>
                      {file.name}
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #94a3b8)', fontSize: '12px' }}>
                      {(file.size / 1024).toFixed(1)} KB — Ready to ingest
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)', fontSize: '15px' }}>
                      Drag and drop your WealthVault CSV here
                    </p>
                    <p style={{ margin: '6px 0 0', color: 'var(--color-text-secondary, #94a3b8)', fontSize: '13px' }}>
                      or click to browse local files (RFC 4180 compliant)
                    </p>
                  </div>
                )}
              </div>

              {/* Supported Columns Guide */}
              <div
                style={{
                  backgroundColor: 'var(--bg-main, #0f172a)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #334155)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)', marginBottom: '4px' }}>
                  Supported 19-Column Schema:
                </div>
                <code>
                  external_id, date, direction, subtype, amount, currency, category, note, purpose_label, bucket, from_bucket, to_bucket, split_tithe, split_kingdom, split_savings, split_invest, split_charity, split_expense, is_override
                </code>
              </div>
            </div>
          ) : (
            /* Results View */
            <div>
              {/* Success Banner */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(22, 163, 74, 0.1)',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  color: '#4ade80',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '20px',
                }}
              >
                <span>✓</span> Ingestion completed successfully for {result.file_name}
              </div>

              {/* KPI Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ backgroundColor: 'var(--bg-main, #0f172a)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>Total Rows</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary, #f8fafc)' }}>
                    {result.total_rows}
                  </div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-main, #0f172a)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
                  <div style={{ fontSize: '11px', color: '#4ade80' }}>Imported</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80' }}>
                    {result.imported_count}
                  </div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-main, #0f172a)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
                  <div style={{ fontSize: '11px', color: '#fbbf24' }}>Skipped (Dedupe)</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#fbbf24' }}>
                    {result.skipped_count}
                  </div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-main, #0f172a)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
                  <div style={{ fontSize: '11px', color: result.failed_count > 0 ? '#f87171' : 'var(--color-text-secondary, #94a3b8)' }}>
                    Errors
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: result.failed_count > 0 ? '#f87171' : 'var(--color-text-secondary, #94a3b8)' }}>
                    {result.failed_count}
                  </div>
                </div>
              </div>

              {/* Ledger Reconciliation Table Card */}
              <div
                style={{
                  backgroundColor: 'var(--bg-main, #0f172a)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #334155)',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)' }}>
                      ⚖️ Bucket Ledger Reconciliation
                    </h4>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      Zero variance audit against historical source records
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: result.reconciliation.reconciled ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: result.reconciliation.reconciled ? '#4ade80' : '#f87171',
                    }}
                  >
                    {result.reconciliation.reconciled ? '✓ Zero Variance' : '⚠️ Variance Detected'}
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--color-text-secondary, #94a3b8)', borderBottom: '1px solid var(--border-color, #334155)' }}>
                        <th style={{ padding: '8px 6px', fontWeight: 600 }}>Bucket</th>
                        <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>Source Total</th>
                        <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>Ledger Net</th>
                        <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>Variance</th>
                        <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Audit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.reconciliation.buckets.map((b: BucketReconciliationItem) => (
                        <tr key={b.bucket_id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                          <td style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-primary, #f8fafc)' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: bucketColors[b.bucket_key] || '#94a3b8' }} />
                            {b.bucket_name}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--color-text-secondary, #94a3b8)' }}>
                            {formatNgn(b.source_total)}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)' }}>
                            {formatNgn(b.ledger_total)}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: b.variance === 0 ? '#4ade80' : '#f87171' }}>
                            {formatNgn(b.variance)}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', color: b.reconciled ? '#4ade80' : '#f87171' }}>
                            {b.reconciled ? '✓ OK' : '⚠️'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Errors Breakdown (if any) */}
              {result.errors && result.errors.length > 0 && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
                  <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '6px' }}>Row Errors Log:</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#fca5a5' }}>
                    {result.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>Row {err.row}: {err.error}</li>
                    ))}
                    {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color, #334155)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-color, #475569)',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || loading}
                style={{
                  padding: '9px 18px',
                  backgroundColor: !file || loading ? 'var(--border-color, #475569)' : 'var(--color-primary, #3b82f6)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: !file || loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {loading ? 'Ingesting Records...' : 'Start Ingestion'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              style={{
                padding: '9px 20px',
                backgroundColor: 'var(--color-primary, #3b82f6)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm, 6px)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Done & Refresh Ledger
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
