import React, { useState, useEffect } from 'react';
import type { AllocationBucket, Category, Account, IncomeSource } from '../../../worker/types';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  buckets: AllocationBucket[];
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  buckets,
}) => {
  const [direction, setDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Inflow-specific state
  const [incomeSourceId, setIncomeSourceId] = useState<string>('');
  const [customSplit, setCustomSplit] = useState<boolean>(false);
  const [tithePct, setTithePct] = useState<number>(10);
  const [kingdomPct, setKingdomPct] = useState<number>(20);
  const [savingsPct, setSavingsPct] = useState<number>(20);
  const [investPct, setInvestPct] = useState<number>(20);
  const [charityPct, setCharityPct] = useState<number>(10);
  const [expensePct, setExpensePct] = useState<number>(50);

  // Outflow-specific state
  const [categoryId, setCategoryId] = useState<string>('');
  const [chosenBucketId, setChosenBucketId] = useState<string>('');
  const [purposeLabel, setPurposeLabel] = useState<string>('');

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [loadingRefs, setLoadingRefs] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchReferenceData();
      setError(null);
    }
  }, [isOpen]);

  const fetchReferenceData = async () => {
    setLoadingRefs(true);
    try {
      const [catsRes, accsRes, incsRes] = await Promise.all([
        fetch('/api/categories', { headers: { 'x-dev-bypass': 'true' } }),
        fetch('/api/accounts', { headers: { 'x-dev-bypass': 'true' } }),
        fetch('/api/income-sources', { headers: { 'x-dev-bypass': 'true' } }),
      ]);

      if (catsRes.ok) {
        const json = await catsRes.json();
        setCategories(json.categories || []);
      }
      if (accsRes.ok) {
        const json = await accsRes.json();
        const accList = json.accounts || [];
        setAccounts(accList);
        if (accList.length > 0 && !accountId) {
          setAccountId(String(accList[0].id));
        }
      }
      if (incsRes.ok) {
        const json = await incsRes.json();
        setIncomeSources(json.income_sources || []);
      }
    } catch (err) {
      console.error('Error fetching reference data:', err);
    } finally {
      setLoadingRefs(false);
    }
  };

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;

  // Selected Category info
  const selectedCategory = categories.find((c) => String(c.id) === categoryId);
  const isFlexibleCategory = selectedCategory?.bucket_is_flexible === 1;
  const isOtherCategory = selectedCategory?.name.toLowerCase() === 'other';

  // Calculate Waterfall preview amounts
  let previewTithe = 0;
  let previewKingdom = 0;
  let previewSavings = 0;
  let previewInvest = 0;
  let previewCharity = 0;
  let previewExpense = 0;

  if (numAmount > 0) {
    if (customSplit) {
      previewTithe = (numAmount * tithePct) / 100;
      previewKingdom = (numAmount * kingdomPct) / 100;
      const remainder = numAmount - previewTithe - previewKingdom;
      previewSavings = (remainder * savingsPct) / 100;
      previewInvest = (remainder * investPct) / 100;
      previewCharity = (remainder * charityPct) / 100;
      previewExpense = (remainder * expensePct) / 100;
    } else {
      previewTithe = numAmount * 0.1;
      previewKingdom = numAmount * 0.2;
      const remainder = numAmount * 0.7;
      previewSavings = remainder * 0.2;
      previewInvest = remainder * 0.2;
      previewCharity = remainder * 0.1;
      previewExpense = remainder * 0.5;
    }
  }

  const formatNgn = (val: number) => {
    return '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!date) {
      setError('Please select a valid date.');
      return;
    }

    if (direction === 'inflow' && customSplit) {
      const remSum = savingsPct + investPct + charityPct + expensePct;
      if (Math.abs(remSum - 100) > 0.01) {
        setError(`Remainder percentages must sum to 100% (currently ${remSum}%). Please adjust Savings, Invest, Charity, or Expense.`);
        return;
      }
    }

    if (direction === 'outflow') {
      if (!categoryId) {
        setError('Please select an expense category.');
        return;
      }
      if (isFlexibleCategory && !chosenBucketId) {
        setError(`Category '${selectedCategory?.name}' is flexible. Please choose the source bucket.`);
        return;
      }
      if (isOtherCategory && !purposeLabel.trim()) {
        setError("Category 'Other' mandates a purpose label.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        date,
        direction,
        amount: numAmount,
        currency: 'NGN',
        account_id: accountId ? Number(accountId) : null,
        note: note.trim() || null,
      };

      if (direction === 'inflow') {
        payload.income_source_id = incomeSourceId ? Number(incomeSourceId) : null;
        if (customSplit) {
          payload.override_split = {
            tithe_pct: tithePct,
            kingdom_pct: kingdomPct,
            savings_pct: savingsPct,
            invest_pct: investPct,
            charity_pct: charityPct,
            expense_pct: expensePct,
          };
        }
      } else {
        payload.category_id = categoryId ? Number(categoryId) : null;
        payload.chosen_bucket_id = chosenBucketId ? Number(chosenBucketId) : null;
        payload.purpose_label = purposeLabel.trim() || null;
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(json.error || 'Failed to record transaction.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error recording transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border-color, #334155)',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: direction === 'inflow' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(220, 38, 38, 0.15)',
                color: direction === 'inflow' ? '#16A34A' : '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '18px',
              }}
            >
              {direction === 'inflow' ? '↓' : '↑'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--color-text-primary, #f8fafc)' }}>
                Add Transaction
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                {direction === 'inflow' ? 'Inflow triggers the 6-bucket waterfall allocation' : 'Outflow debits from dedicated or flexible bucket'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #94a3b8)',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Direction Switcher */}
        <div style={{ padding: '16px 24px 0 24px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-subtle, #0f172a)',
              borderRadius: '8px',
              padding: '4px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setDirection('inflow');
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                backgroundColor: direction === 'inflow' ? 'var(--color-positive, #16a34a)' : 'transparent',
                color: direction === 'inflow' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)',
                transition: 'all 0.15s ease',
              }}
            >
              ↓ Inflow (Income & Allocation)
            </button>
            <button
              type="button"
              onClick={() => {
                setDirection('outflow');
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                backgroundColor: direction === 'outflow' ? 'var(--color-negative, #dc2626)' : 'transparent',
                color: direction === 'outflow' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)',
                transition: 'all 0.15s ease',
              }}
            >
              ↑ Outflow (Expense Debit)
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                color: '#f87171',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          {/* Amount and Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Amount (₦) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50,000.00"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--color-text-primary, #f8fafc)',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--color-text-primary, #f8fafc)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Account Dropdown */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Bank / Source Account
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-primary, #f8fafc)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">(None / General Account)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {/* INFLOW SPECIFIC FIELDS */}
          {direction === 'inflow' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  Income Source
                </label>
                <select
                  value={incomeSourceId}
                  onChange={(e) => setIncomeSourceId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-subtle, #0f172a)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--color-text-primary, #f8fafc)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">(Select Income Source or General)</option>
                  {incomeSources.map((src) => (
                    <option key={src.id} value={src.id}>
                      {src.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Waterfall Breakdown Preview */}
              <div
                style={{
                  backgroundColor: 'var(--bg-subtle, #0f172a)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #334155)',
                  padding: '14px 16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary, #f8fafc)' }}>
                    🌊 6-Bucket Allocation Preview
                  </span>
                  <label style={{ fontSize: '11px', color: 'var(--color-primary, #3b82f6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={customSplit}
                      onChange={(e) => setCustomSplit(e.target.checked)}
                    />
                    Custom Override Split
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderLeft: '3px solid var(--bucket-tithe, #8b5cf6)', backgroundColor: 'rgba(139, 92, 246, 0.05)' }}>
                    <span>Tithe ({tithePct}%):</span>
                    <strong className="tabular-nums">{formatNgn(previewTithe)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderLeft: '3px solid var(--bucket-kingdom, #ec4899)', backgroundColor: 'rgba(236, 72, 153, 0.05)' }}>
                    <span>Kingdom ({kingdomPct}%):</span>
                    <strong className="tabular-nums">{formatNgn(previewKingdom)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderLeft: '3px solid var(--bucket-savings, #3b82f6)', backgroundColor: 'rgba(59, 130, 246, 0.05)' }}>
                    <span>Savings ({customSplit ? savingsPct + '%' : '14%'}):</span>
                    <strong className="tabular-nums">{formatNgn(previewSavings)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderLeft: '3px solid var(--bucket-invest, #10b981)', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
                    <span>Invest ({customSplit ? investPct + '%' : '14%'}):</span>
                    <strong className="tabular-nums">{formatNgn(previewInvest)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderLeft: '3px solid var(--bucket-charity, #f59e0b)', backgroundColor: 'rgba(245, 158, 11, 0.05)' }}>
                    <span>Charity ({customSplit ? charityPct + '%' : '7%'}):</span>
                    <strong className="tabular-nums">{formatNgn(previewCharity)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderLeft: '3px solid var(--bucket-expense, #ef4444)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                    <span>Expense ({customSplit ? expensePct + '%' : '35%'}):</span>
                    <strong className="tabular-nums">{formatNgn(previewExpense)}</strong>
                  </div>
                </div>

                {/* Interactive Custom Split Control Panel */}
                {customSplit && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Phase 1: Gross Deductions
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setTithePct(10);
                            setKingdomPct(20);
                            setSavingsPct(20);
                            setInvestPct(20);
                            setCharityPct(10);
                            setExpensePct(50);
                          }}
                          style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                        >
                          Default 10/20
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTithePct(50);
                            setKingdomPct(0);
                            setSavingsPct(0);
                            setInvestPct(0);
                            setCharityPct(0);
                            setExpensePct(100);
                          }}
                          style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--color-primary)', background: 'rgba(37,99,235,0.1)', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
                        >
                          50% Tithe / 50% Exp
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTithePct(0);
                            setKingdomPct(0);
                            setSavingsPct(0);
                            setInvestPct(0);
                            setCharityPct(0);
                            setExpensePct(100);
                          }}
                          style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                        >
                          100% Expense
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>
                          Tithe (% of gross)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={tithePct}
                          onChange={(e) => setTithePct(Math.max(0, Math.min(100, Number(e.target.value))))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>
                          Kingdom Investment (% of gross)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={kingdomPct}
                          onChange={(e) => setKingdomPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Phase 2: Remainder Base ({100 - tithePct - kingdomPct}% of gross)
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: (savingsPct + investPct + charityPct + expensePct === 100) ? 'var(--color-positive)' : 'var(--color-negative)',
                        }}
                      >
                        Sum: {savingsPct + investPct + charityPct + expensePct}% {savingsPct + investPct + charityPct + expensePct === 100 ? '✓' : '(Must = 100%)'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Savings %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={savingsPct}
                          onChange={(e) => setSavingsPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                          style={{ width: '100%', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-primary)', fontSize: '12px', textAlign: 'center', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Invest %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={investPct}
                          onChange={(e) => setInvestPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                          style={{ width: '100%', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-primary)', fontSize: '12px', textAlign: 'center', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Charity %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={charityPct}
                          onChange={(e) => setCharityPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                          style={{ width: '100%', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-primary)', fontSize: '12px', textAlign: 'center', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Expense %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={expensePct}
                          onChange={(e) => setExpensePct(Math.max(0, Math.min(100, Number(e.target.value))))}
                          style={{ width: '100%', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--color-text-primary)', fontSize: '12px', textAlign: 'center', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* OUTFLOW SPECIFIC FIELDS */}
          {direction === 'outflow' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  Expense Category *
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    const cat = categories.find((c) => String(c.id) === e.target.value);
                    if (cat && !cat.bucket_is_flexible && cat.default_bucket_id) {
                      setChosenBucketId(String(cat.default_bucket_id));
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-subtle, #0f172a)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--color-text-primary, #f8fafc)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">(Select Category)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.bucket_is_flexible ? '(Flexible Bucket)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seed / Flexible Category Bucket Picker */}
              {isFlexibleCategory && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px dashed var(--color-primary, #3b82f6)',
                    borderRadius: '6px',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-primary, #f8fafc)' }}>
                    Source Bucket (Seed / Flexible Category) *
                  </label>
                  <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    Flexible expenses allow drawing capital directly from any designated bucket.
                  </p>
                  <select
                    required
                    value={chosenBucketId}
                    onChange={(e) => setChosenBucketId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-card, #1e293b)',
                      border: '1px solid var(--border-color, #334155)',
                      color: 'var(--color-text-primary, #f8fafc)',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">(Choose Bucket to Debit)</option>
                    {buckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — Balance: {formatNgn(b.balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Purpose Label (Mandatory if Other) */}
              {(isOtherCategory || isFlexibleCategory) && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    Purpose Label {isOtherCategory ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    required={isOtherCategory}
                    value={purposeLabel}
                    onChange={(e) => setPurposeLabel(e.target.value)}
                    placeholder="Specific purpose (e.g. Outreach logistics, Medical urgent care)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-subtle, #0f172a)',
                      border: '1px solid var(--border-color, #334155)',
                      color: 'var(--color-text-primary, #f8fafc)',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* Note / Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Note / Narrative
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. October Consulting Retainer or Groceries at Shoprite"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-primary, #f8fafc)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 18px',
                backgroundColor: 'var(--bg-subtle, #0f172a)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--color-text-secondary, #94a3b8)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingRefs}
              style={{
                padding: '9px 20px',
                backgroundColor: direction === 'inflow' ? 'var(--color-positive, #16a34a)' : 'var(--color-primary, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Recording...' : direction === 'inflow' ? 'Record & Allocate Inflow' : 'Record Outflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
