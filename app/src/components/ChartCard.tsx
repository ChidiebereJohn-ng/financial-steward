import React, { useEffect, useRef } from 'react';
import Chart, { ChartConfiguration } from 'chart.js/auto';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  config: ChartConfiguration;
  height?: number;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  actions,
  config,
  height = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    // Modern light theme defaults for Chart.js
    Chart.defaults.color = '#64748b';
    Chart.defaults.borderColor = '#f1f5f9';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    chartInstanceRef.current = new Chart(canvasRef.current, {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...config.options?.plugins,
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
            usePointStyle: true,
            ...config.options?.plugins?.tooltip,
          },
        },
        ...config.options,
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [config]);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-title-group">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="chart-actions">{actions}</div>}
      </div>
      <div className="chart-container" style={{ height: `${height}px` }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};
