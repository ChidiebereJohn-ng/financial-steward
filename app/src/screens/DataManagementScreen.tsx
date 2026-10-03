import React, { useState, useRef } from 'react';
import type { ImportProcessingResult } from '../../../worker/types';
import { formatNgn } from '../utils/format';

export const DataManagementScreen: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setResult(null);
      } else {
        setError('Please drop a valid .csv file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file to upload.');
      return;
    }

    try {
      setUploading(true);
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
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'external_id',
      'date',
      'direction',
      'subtype',
      'amount',
      'currency',
      'category',
      'note',
      'purpose_label',
      'bucket',
      'from_bucket',
      'to_bucket',
      'split_tithe',
      'split_kingdom',
      'split_savings',
      'split_invest',
      'split_charity',
      'split_expense',
      'is_override',
    ].join(',');

    const sampleRows = [
      'sample_inflow_01,2026-10-01,inflow,,100000.00,NGN,Salary,October Stewardship Income,,expenses,,,,10000.00,20000.00,14000.00,14000.00,7000.00,35000.00,0',
      'sample_outflow_02,2026-10-01,outflow,,15000.00,NGN,Utilities,Internet Subscription,Internet Bills,expenses,,,,,,,,,,',
    ].join('\n');

    const csvContent = `${headers}\n${sampleRows}\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'financial_steward_upload_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      setDownloading(true);
      setExportFeedback(null);

      const res = await fetch('/api/export?format=csv', {
        headers: { 'x-dev-bypass': 'true' },
      });

      if (!res.ok) throw new Error('Export generation failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial_steward_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportFeedback('CSV export archive successfully downloaded!');
      setTimeout(() => setExportFeedback(null), 5000);
    } catch (err: any) {
      setExportFeedback(err.message || 'Failed to download export.');
    } finally {
      setDownloading(false);
    }
  };

  const handleResetDatabase = async () => {
    try {
      setResetting(true);
      setResetSuccess(null);
      setError(null);

      const res = await fetch('/api/database/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResetSuccess(json.message || 'Database successfully wiped clean to zero.');
        setResetConfirm(false);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setError(json.error || 'Failed to reset database.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error during reset.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 className="screen-title">Data Management (Upload & Export)</h2>
        <p className="screen-subtitle">
          Import your existing spreadsheets and financial records into the app, or download a full ledger backup archive.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {/* Upload Existing Data Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                color: 'var(--color-positive)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              📤
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Upload & Connect Your Data
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Ingest historical transactions from Excel, Google Sheets, or previous tools.
              </p>
            </div>
          </div>

          {/* Download Starter Template */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-primary)' }}>
                Need a pre-formatted template?
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Download our RFC 4180 CSV starter template to format your data easily.
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⬇ Download Template
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--color-negative)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-negative)',
                fontSize: '13px',
                marginBottom: '14px',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--border-color)'}`,
              backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-subtle, #0f172a)',
              borderRadius: 'var(--radius-md)',
              padding: '30px 20px',
              textAlign: 'center',
              cursor: 'pointer',
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
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
            {file ? (
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '14px' }}>
                  {file.name}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                  {(file.size / 1024).toFixed(1)} KB — Ready to upload
                </p>
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '14px' }}>
                  Click to select or drag & drop CSV file
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                  Supports WealthVault and standard RFC 4180 CSV exports
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: !file || uploading ? 'var(--border-color)' : 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: !file || uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Processing & Reconciling Ingestion...' : 'Upload & Reconcile Data'}
          </button>

          {/* Results Summary */}
          {result && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid var(--color-positive)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-positive)', marginBottom: '8px' }}>
                ✓ Ingestion Completed: {result.file_name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total: </span>
                  <strong>{result.total_rows}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Imported: </span>
                  <strong style={{ color: 'var(--color-positive)' }}>{result.imported_rows}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Duplicates: </span>
                  <strong>{result.skipped_duplicates}</strong>
                </div>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Zero-Variance Status: <strong>{result.reconciliation.overall_status.toUpperCase()}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Export Data Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                }}
              >
                📥
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Export Platform Data
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Download an immutable CSV archive of your financial steward database.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
              Your export includes all recorded inflows, 6-bucket allocation runs, category expense debits, and ledger audit logs. The file conforms to RFC 4180 standards and can be re-imported into this application or analyzed in Excel, Google Sheets, or BigQuery.
            </p>

            {exportFeedback && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: exportFeedback.includes('failed') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  border: `1px solid ${exportFeedback.includes('failed') ? 'var(--color-negative)' : 'var(--color-positive)'}`,
                  borderRadius: 'var(--radius-sm)',
                  color: exportFeedback.includes('failed') ? 'var(--color-negative)' : 'var(--color-positive)',
                  fontSize: '13px',
                  margin: '14px 0',
                }}
              >
                {exportFeedback}
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            disabled={downloading}
            style={{
              marginTop: '20px',
              padding: '11px 18px',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: downloading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>💾</span>
            {downloading ? 'Generating Export File...' : 'Download Full CSV Export'}
          </button>
        </div>
      </div>

      {/* Danger Zone: Reset Database / Clean Slate */}
      <div
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.03)',
          borderRadius: 'var(--radius-card)',
          padding: '24px',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-negative)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            ⚠️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-negative)' }}>
              Clean Slate / Reset Test Data
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Permanently wipe all demo transactions, bucket ledger logs, goals, liabilities, and investment entries to start a fresh project.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6', margin: 0 }}>
          This operation resets all accounts and bucket balances back to <strong>₦0.00</strong>. Your base categories, allocation rules (e.g. 10/10/20/15/35/10), accounts, and structure are completely preserved so you can immediately begin recording real personal data.
        </p>

        {resetSuccess && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid var(--color-positive)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-positive)',
              fontSize: '13px',
            }}
          >
            {resetSuccess} Reloading app...
          </div>
        )}

        {!resetConfirm ? (
          <div>
            <button
              onClick={() => setResetConfirm(true)}
              style={{
                padding: '10px 18px',
                backgroundColor: 'transparent',
                color: 'var(--color-negative)',
                border: '1px solid var(--color-negative)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
            >
              <span>🗑️</span>
              Reset Database to Clean Slate
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: '16px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-negative)' }}>
              Are you sure? This will delete all demo transactions, history, and reset your net worth to ₦0.00. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleResetDatabase}
                disabled={resetting}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'var(--color-negative)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: resetting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {resetting ? 'Wiping Database...' : 'Yes, Wipe Everything & Reset to ₦0'}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                disabled={resetting}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
