import React, { useEffect, useRef } from 'react';
import Chart, { ChartConfiguration } from 'chart.js/auto';

interface ChartCardProps {
  title: string;
  actions?: React.ReactNode;
  config: ChartConfiguration;
  height?: number;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  actions,
  config,
  height = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy prior instance if existing
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    // Apply dark mode theme defaults to Chart.js
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#24324f';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    // Create chart
    chartInstanceRef.current = new Chart(canvasRef.current, {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
        <h3 className="chart-title">{title}</h3>
        {actions && <div className="chart-actions">{actions}</div>}
      </div>
      <div className="chart-container" style={{ height: `${height}px` }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};
