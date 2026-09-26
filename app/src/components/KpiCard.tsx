import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: string | number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  trend,
}) => {
  return (
    <div className="kpi-card">
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
      </div>
      {(subtext || trend) && (
        <div className="kpi-footer">
          {trend && (
            <span
              className={`trend-pill ${
                trend.direction === 'up'
                  ? 'trend-up'
                  : trend.direction === 'down'
                  ? 'trend-down'
                  : ''
              }`}
            >
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '•'}{' '}
              {trend.value}
            </span>
          )}
          {subtext && <span>{subtext}</span>}
        </div>
      )}
    </div>
  );
};
