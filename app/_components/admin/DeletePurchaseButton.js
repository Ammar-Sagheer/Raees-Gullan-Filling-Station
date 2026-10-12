'use client';

import { useActionState } from 'react';

import { deletePurchase } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import { useI18n } from '@/app/_components/i18n/I18nProvider';
import { rich } from '@/app/_lib/i18n/core';

/**
 * Owner-only. The way to correct a mistyped delivery: remove it and record it
 * again. Stock recalculates itself from history, so the correction flows
 * straight through to the stock and gain/loss figures.
 *
 * Two taps rather than one - deleting a delivery moves the stock figures, so it
 * should not happen from a stray tap on a phone.
 *
 * `kind` tells the action which list this row belongs to, since fuel and
 * lubricant purchases share one table on screen.
 */
export default function DeletePurchaseButton({ purchaseId, summary, kind = 'fuel' }) {
    const [state, formAction] = useActionState(deletePurchase, null);
  const { t } = useI18n();

  return (
    <ConfirmAction
            triggerLabel={t('purchases.deleteLabel')}
      title={t('purchases.deleteTitle')}
      confirmLabel={t('purchases.deleteConfirm')}
      pendingLabel={t('purchases.deleting')}
      action={formAction}
      state={state}
      hidden={{ purchase_id: purchaseId, kind }}
    >
      <p>
                {rich(t, 'purchases.deleteAsk', { summary: <span className="font-semibold text-ink-900">{summary}</span> })}
      </p>
    </ConfirmAction>
  );
}
