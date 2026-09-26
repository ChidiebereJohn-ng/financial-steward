import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  trend?: {
    value: string | number;
    direction: 'up' | 'down' | 'neutral';
  };
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  icon,
  iconBg = 'rgba(37, 99, 235, 0.08)',
  iconColor = 'var(--color-primary)',
  trend,
}) => {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        {icon && (
          <div
            className="kpi-icon-box"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="kpi-value tabular-nums">{value}</div>

      {(subtext || trend) && (
        <div className="kpi-footer">
          {trend && (
            <span
              className={`trend-indicator ${
                trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : ''
              }`}
            >
              {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '•'}{' '}
              {trend.value}
            </span>
          )}
          {subtext && <span>{subtext}</span>}
        </div>
      )}
    </div>
  );
};
