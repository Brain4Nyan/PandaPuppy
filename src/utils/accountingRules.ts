// Accounting rules for credit/debit classification
export interface AccountingRule {
  accountType: string;
  creditRule: 'increase' | 'decrease';
}

export const ACCOUNTING_RULES: AccountingRule[] = [
  { accountType: 'Asset', creditRule: 'decrease' },
  { accountType: 'Liability', creditRule: 'increase' },
  { accountType: 'Equity', creditRule: 'increase' },
  { accountType: 'Revenue/Income', creditRule: 'increase' },
  { accountType: 'Cost/Expense', creditRule: 'decrease' }
];

export interface ClassifiedEntry {
  entryName: string;
  amount: number;
  debitAmount: number | null;
  creditAmount: number | null;
  accountType: string;
  classification: 'Credit' | 'Debit';
  needsReview: boolean;
  reason?: string;
}

export function determineClassification(
  amount: number,
  accountType: string
): { classification: 'Credit' | 'Debit'; needsReview: boolean; reason?: string } {
  const rule = ACCOUNTING_RULES.find(
    (r) => r.accountType.toLowerCase() === accountType.toLowerCase()
  );

  if (!rule) {
    return {
      classification: 'Debit',
      needsReview: true,
      reason: `Unknown account type: ${accountType}`
    };
  }

  // Determine if the amount represents an increase or decrease
  const isIncrease = amount > 0;

  // Apply the accounting rule
  const isCredit =
    (isIncrease && rule.creditRule === 'increase') ||
    (!isIncrease && rule.creditRule === 'decrease');

  return {
    classification: isCredit ? 'Credit' : 'Debit',
    needsReview: false
  };
}

export function classifyEntry(
  entryName: string,
  amount: number,
  accountType: string
): ClassifiedEntry {
  const { classification, needsReview, reason } = determineClassification(
    amount,
    accountType
  );

  // Convert the amount to positive and assign to appropriate column
  const positiveAmount = Math.abs(amount);
  const debitAmount = classification === 'Debit' ? positiveAmount : null;
  const creditAmount = classification === 'Credit' ? positiveAmount : null;

  return {
    entryName,
    amount: positiveAmount,
    debitAmount,
    creditAmount,
    accountType,
    classification,
    needsReview,
    reason
  };
}