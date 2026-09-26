import React, { useState } from 'react';
import { Navigation, NavTab } from './components/Navigation';
import { HealthDashboard } from './screens/HealthDashboard';
import { LedgerDashboard } from './screens/LedgerDashboard';
import { BudgetsScreen } from './screens/BudgetsScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { LiabilitiesScreen } from './screens/LiabilitiesScreen';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('health');
  const [budgetSubTab, setBudgetSubTab] = useState<'budgets' | 'goals'>('budgets');

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
          <div>
            {/* Sub-tab switcher between Budgets and Goals */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <button
                onClick={() => setBudgetSubTab('budgets')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: budgetSubTab === 'budgets' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: budgetSubTab === 'budgets' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${budgetSubTab === 'budgets' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Monthly Budgets (Screen 5)
              </button>
              <button
                onClick={() => setBudgetSubTab('goals')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: budgetSubTab === 'goals' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: budgetSubTab === 'goals' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${budgetSubTab === 'goals' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Financial Goals (Screen 6)
              </button>
            </div>

            {budgetSubTab === 'budgets' ? <BudgetsScreen /> : <GoalsScreen />}
          </div>
        )}
        {activeTab === 'more' && (
          <div>
            <LiabilitiesScreen />
          </div>
        )}
      </main>
    </div>
  );
};
