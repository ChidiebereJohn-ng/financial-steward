import React, { useState } from 'react';
import { Navigation, NavTab } from './components/Navigation';
import { HealthDashboard } from './screens/HealthDashboard';
import { LedgerDashboard } from './screens/LedgerDashboard';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('health');

  return (
    <div className="app-container">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">
        {activeTab === 'health' && <HealthDashboard />}
        {activeTab === 'ledger' && <LedgerDashboard />}
        {activeTab === 'investor' && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Investor Module</h2>
            <p>Scheduled for Module 6: NGX manual prices, live crypto, and staged compounding simulator.</p>
          </div>
        )}
        {activeTab === 'budgets' && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Budgets & Goals</h2>
            <p>Scheduled for Module 4: Category planned amounts, adherence trends, and goal tracking.</p>
          </div>
        )}
        {activeTab === 'more' && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>More Tools & Settings</h2>
            <p>Scheduled for Modules 5 & 7: Purchase Calculator, Research Digest, and CSV Data Export.</p>
          </div>
        )}
      </main>
    </div>
  );
};
