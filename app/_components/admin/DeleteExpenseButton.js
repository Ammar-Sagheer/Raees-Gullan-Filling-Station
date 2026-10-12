'use client';

import { useActionState } from 'react';

import { deleteExpense } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import { useI18n } from '@/app/_components/i18n/I18nProvider';
import { rich } from '@/app/_lib/i18n/core';

/**
 * Owner-only. An expense feeds the monthly profit figure, so a mistyped amount
 * quietly distorts it - this is how it gets corrected.
 *
 * Confirms first, like the delivery delete: removing money from the books
 * should not happen from a stray tap on a phone.
 */
export default function DeleteExpenseButton({ expenseId, summary }) {
    const [state, formAction] = useActionState(deleteExpense, null);
  const { t } = useI18n();

  return (
    <ConfirmAction
            triggerLabel={t('expenses.deleteLabel')}
      title={t('expenses.deleteTitle')}
      confirmLabel={t('expenses.deleteConfirm')}
      pendingLabel={t('expenses.deleting')}
      action={formAction}
      state={state}
      hidden={{ expense_id: expenseId }}
    >
      <p>
                {rich(t, 'expenses.deleteAsk', { summary: <span className="font-semibold text-ink-900">{summary}</span> })}
      </p>
    </ConfirmAction>
  );
}
