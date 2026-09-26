import React from 'react';

export type BucketKey = 'tithe' | 'kingdom' | 'savings' | 'invest' | 'charity' | 'expense';

interface BucketBadgeProps {
  bucketKey: BucketKey | string;
  name?: string;
}

const BUCKET_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  tithe: { label: 'Tithe', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  kingdom: { label: 'Kingdom', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' },
  savings: { label: 'Savings', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  invest: { label: 'Investment', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  charity: { label: 'Charity', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  expense: { label: 'Expenses', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
};

export const BucketBadge: React.FC<BucketBadgeProps> = ({ bucketKey, name }) => {
  const normalizedKey = bucketKey.toLowerCase();
  const config = BUCKET_CONFIG[normalizedKey] || {
    label: name || bucketKey,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.15)',
  };

  return (
    <span
      className="bucket-badge"
      style={{
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.color}33`,
      }}
    >
      <span className="badge-dot" style={{ backgroundColor: config.color }} />
      {name || config.label}
    </span>
  );
};
