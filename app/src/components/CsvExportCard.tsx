import React, { useState } from 'react';

export const CsvExportCard: React.FC = () => {
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setFeedback(null);

      const res = await fetch('/api/export?format=csv', {
        headers: { 'x-dev-bypass': 'true' },
      });

      if (!res.ok) {
        throw new Error('Export generation failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial_steward_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setFeedback('CSV export archive successfully downloaded!');
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      console.error('Export download error:', err);
      setFeedback('Failed to download export. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '24px',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-color)',
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
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
            Full Financial Data Export
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Download an RFC 4180 compliant CSV archive of all transactions, bucket ledgers, investments, budgets, and snapshots.
          </p>
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--bg-page)',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
        }}
      >
        <strong>Included Sections:</strong> Transactions, Bucket Ledger Entries, Investments & Holdings, Budgets, Goals, Liabilities, and Net Worth Snapshots. Compatible with Microsoft Excel, Apple Numbers, and Python pandas.
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 500,
            backgroundColor: feedback.includes('success') ? '#f0fdf4' : '#fef2f2',
            color: feedback.includes('success') ? '#166534' : '#991b1b',
            border: `1px solid ${feedback.includes('success') ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {feedback}
        </div>
      )}

      <div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: downloading ? 'not-allowed' : 'pointer',
            opacity: downloading ? 0.7 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {downloading ? 'Generating CSV Archive...' : 'Download Complete Data (CSV)'}
        </button>
      </div>
    </div>
  );
};
