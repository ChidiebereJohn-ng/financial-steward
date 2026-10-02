import React, { useState } from 'react';
import { Navigation, NavTab } from './components/Navigation';
import { HealthDashboard } from './screens/HealthDashboard';
import { LedgerDashboard } from './screens/LedgerDashboard';
import { BudgetsScreen } from './screens/BudgetsScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { LiabilitiesScreen } from './screens/LiabilitiesScreen';
import { InvestorScreen } from './screens/InvestorScreen';
import { PurchaseCalculatorScreen } from './screens/PurchaseCalculatorScreen';
import { DigestScreen } from './screens/DigestScreen';
import { RecurringScreen } from './screens/RecurringScreen';
import { DataManagementScreen } from './screens/DataManagementScreen';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('health');
  const [budgetSubTab, setBudgetSubTab] = useState<'budgets' | 'goals' | 'recurring' | 'liabilities'>('budgets');
  const [moreSubTab, setMoreSubTab] = useState<'calculator' | 'digest' | 'liabilities' | 'export'>('calculator');

  return (
    <div className="app-container">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">
        {activeTab === 'health' && <HealthDashboard />}
        {activeTab === 'ledger' && <LedgerDashboard />}
        {activeTab === 'investor' && <InvestorScreen />}
        {activeTab === 'budgets' && (
          <div>
            {/* Sub-tab switcher between Budgets, Goals, Recurring & Liabilities */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap' }}>
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
                Monthly Budgets
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
                Financial Goals
              </button>
              <button
                onClick={() => setBudgetSubTab('recurring')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: budgetSubTab === 'recurring' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: budgetSubTab === 'recurring' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${budgetSubTab === 'recurring' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Recurring Commitments
              </button>
              <button
                onClick={() => setBudgetSubTab('liabilities')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: budgetSubTab === 'liabilities' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: budgetSubTab === 'liabilities' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${budgetSubTab === 'liabilities' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Liabilities & Debt
              </button>
            </div>

            {budgetSubTab === 'budgets' && <BudgetsScreen />}
            {budgetSubTab === 'goals' && <GoalsScreen />}
            {budgetSubTab === 'recurring' && <RecurringScreen />}
            {budgetSubTab === 'liabilities' && <LiabilitiesScreen />}
          </div>
        )}
        {activeTab === 'more' && (
          <div>
            {/* Sub-tab switcher for Tools, Digest, Liabilities & Export */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setMoreSubTab('calculator')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: moreSubTab === 'calculator' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: moreSubTab === 'calculator' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${moreSubTab === 'calculator' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Purchase Calculator (Screen 8)
              </button>
              <button
                onClick={() => setMoreSubTab('digest')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: moreSubTab === 'digest' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: moreSubTab === 'digest' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${moreSubTab === 'digest' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Research Digest (Screen 11)
              </button>
              <button
                onClick={() => setMoreSubTab('liabilities')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: moreSubTab === 'liabilities' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: moreSubTab === 'liabilities' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${moreSubTab === 'liabilities' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Liabilities & Debt (Screen 9)
              </button>
              <button
                onClick={() => setMoreSubTab('export')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: moreSubTab === 'export' ? 'var(--color-primary)' : 'var(--bg-card)',
                  color: moreSubTab === 'export' ? '#ffffff' : 'var(--color-text-secondary)',
                  border: `1px solid ${moreSubTab === 'export' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                }}
              >
                Data Management (Upload & Export)
              </button>
            </div>

            {moreSubTab === 'calculator' && <PurchaseCalculatorScreen />}
            {moreSubTab === 'digest' && <DigestScreen />}
            {moreSubTab === 'liabilities' && <LiabilitiesScreen />}
            {moreSubTab === 'export' && <DataManagementScreen />}
          </div>
        )}
      </main>
    </div>
  );
};
